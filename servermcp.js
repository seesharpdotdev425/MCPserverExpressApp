const express = require('express');
const fs = require('fs');
const path = require('path');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');

const app = express();
const PORT = 3000;

// Add CORS middleware
// Add basic request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

const DATA_FILE = path.join(__dirname, 'tasks.json');

// Helper to read tasks from file
function readTasks() {
  if (!fs.existsSync(DATA_FILE)) return [];
  const data = fs.readFileSync(DATA_FILE, 'utf-8');
  return data ? JSON.parse(data) : [];
}

// Helper to write tasks to file
function writeTasks(tasks) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(tasks, null, 2));
}

// Create persistent MCP Server instance
const server = new McpServer({
  name: "task-crud-server",
  version: "1.0.0"
});

// Create persistent transport
const transport = new StreamableHTTPServerTransport({
  path: '/api/mcp',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Accept'],
    credentials: true
  }
});

// Register tools
server.registerTool(
  "create_task",
  {
    description: 'Create a new task',
    inputSchema: { 
      title: z.string().describe('Title of the task to create'),
      completed: z.boolean().optional().describe('Task completion status')
    },
  },
  async ({ title, completed = false }) => {
    const tasks = readTasks();
    const newTask = {
      id: Date.now().toString(),
      title,
      completed
    };
    tasks.push(newTask);
    writeTasks(tasks);
    return { content: [{ type: 'text', text: `Task created: ${JSON.stringify(newTask)}` }] };
  }
);

server.registerTool(
  "get_tasks",
  {
    description: 'Get all tasks'
  },
  async () => {
    const tasks = readTasks();
    return { content: [{ type: 'text', text: `All tasks: ${JSON.stringify(tasks, null, 2)}` }] };
  }
);

server.registerTool(
  "get_task",
  {
    description: 'Get a task by ID',
    inputSchema: { id: z.string().describe('Task ID') },
  },
  async ({ id }) => {
    try {
      const tasks = readTasks();
      const task = tasks.find(t => t.id === id);
      if (!task) {
        throw new Error();
      }
      return { content: [{ type: 'text', text: `Task: ${JSON.stringify(task)}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Task not found with ID: ${id}` }], isError: true };
    }
  }
);

server.registerTool(
  "update_task",
  {
    description: 'Update a task',
    inputSchema: {
      id: z.string().describe('Task ID'),
      title: z.string().optional().describe('New task title'),
      completed: z.boolean().optional().describe('Task completion status')
    },
  },
  async ({ id, title, completed }) => {
    try {
      const tasks = readTasks();
      const idx = tasks.findIndex(t => t.id === id);
      if (idx === -1) {
        throw new Error();
      }

      if (title !== undefined) tasks[idx].title = title;
      if (completed !== undefined) tasks[idx].completed = completed;
      writeTasks(tasks);
      
      return { content: [{ type: 'text', text: `Task updated: ${JSON.stringify(tasks[idx])}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Task not found with ID: ${id}` }], isError: true };
    }
  }
);

server.registerTool(
  "delete_task",
  {
    description: 'Delete a task',
    inputSchema: { id: z.string().describe('Task ID to delete') },
  },
  async ({ id }) => {
    try {
      const tasks = readTasks();
      const idx = tasks.findIndex(t => t.id === id);
      if (idx === -1) {
        throw new Error();
      }
      const deleted = tasks.splice(idx, 1)[0];
      writeTasks(tasks);
      return { content: [{ type: 'text', text: `Task deleted successfully: ${JSON.stringify(deleted)}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Task not found with ID: ${id}` }], isError: true };
    }
  }
);

// Add a health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Connect server to transport
server.connect(transport).then(() => {
  console.log('MCP Server connected to transport successfully');
}).catch(err => {
  console.error('Error connecting MCP server to transport:', err);
});

// Start a heartbeat interval
const heartbeatInterval = setInterval(() => {
  console.log(`Server heartbeat - Uptime: ${process.uptime().toFixed(2)}s`);
}, 10000); // Log every 10 seconds

// Cleanup on shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  clearInterval(heartbeatInterval);
  server.close();
  transport.close();
  process.exit(0);
});

app.all('/api/mcp', async function(req, res, next) {
  try {
    // Set SSE headers for GET requests
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
    }
    
    // Handle the request using the persistent transport
    await transport.handleRequest(req, res, req.body);

  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}/api/mcp`);
});
