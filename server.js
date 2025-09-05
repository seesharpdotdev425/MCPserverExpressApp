const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Add request logging middleware
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

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// GET all tasks
app.get('/tasks', (req, res) => {
    try {
        console.log('Getting all tasks');
        const tasks = readTasks();
        console.log(`Retrieved ${tasks.length} tasks`);
        res.json(tasks);
    } catch (error) {
        console.error('Error reading tasks:', error);
        res.status(500).json({ error: 'Error reading tasks' });
    }
});

// GET single task by ID
app.get('/tasks/:id', (req, res) => {
    try {
        console.log(`Getting task with ID: ${req.params.id}`);
        const tasks = readTasks();
        const task = tasks.find(t => t.id === req.params.id);
        if (!task) {
            console.log(`Task not found with ID: ${req.params.id}`);
            return res.status(404).json({ error: 'Task not found' });
        }
        console.log('Task found:', task);
        res.json(task);
    } catch (error) {
        console.error('Error reading task:', error);
        res.status(500).json({ error: 'Error reading task' });
    }
});

// CREATE new task
app.post('/tasks', (req, res) => {
    try {
        console.log('Creating new task with data:', req.body);
        const { title } = req.body;
        if (!title) {
            console.log('Title is missing in request');
            return res.status(400).json({ error: 'Title is required' });
        }

        const tasks = readTasks();
        const newTask = {
            id: Date.now().toString(),
            title,
            completed: false
        };
        tasks.push(newTask);
        writeTasks(tasks);
        console.log('New task created:', newTask);
        res.status(201).json(newTask);
    } catch (error) {
        console.error('Error creating task:', error);
        res.status(500).json({ error: 'Error creating task' });
    }
});

// UPDATE task
app.put('/tasks/:id', (req, res) => {
    try {
        console.log(`Updating task ${req.params.id} with data:`, req.body);
        const { title, completed } = req.body;
        const tasks = readTasks();
        const index = tasks.findIndex(t => t.id === req.params.id);
        
        if (index === -1) {
            console.log(`Task not found with ID: ${req.params.id}`);
            return res.status(404).json({ error: 'Task not found' });
        }

        if (title !== undefined) tasks[index].title = title;
        if (completed !== undefined) tasks[index].completed = completed;
        
        writeTasks(tasks);
        console.log('Task updated:', tasks[index]);
        res.json(tasks[index]);
    } catch (error) {
        console.error('Error updating task:', error);
        res.status(500).json({ error: 'Error updating task' });
    }
});

// DELETE task
app.delete('/tasks/:id', (req, res) => {
    try {
        console.log(`Deleting task with ID: ${req.params.id}`);
        const tasks = readTasks();
        const index = tasks.findIndex(t => t.id === req.params.id);
        
        if (index === -1) {
            console.log(`Task not found with ID: ${req.params.id}`);
            return res.status(404).json({ error: 'Task not found' });
        }

        const deletedTask = tasks.splice(index, 1)[0];
        writeTasks(tasks);
        console.log('Task deleted:', deletedTask);
        res.json(deletedTask);
    } catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).json({ error: 'Error deleting task' });
    }
});

// Start a heartbeat interval
const heartbeatInterval = setInterval(() => {
    console.log(`Server heartbeat - Uptime: ${process.uptime().toFixed(2)}s`);
}, 10000); // Log every 10 seconds

// Cleanup on shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    clearInterval(heartbeatInterval);
    console.log('Cleanup complete');
    process.exit(0);
});

// Error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    clearInterval(heartbeatInterval);
    process.exit(1);
});

// Error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const server = app.listen(PORT, () => {
    console.log(`Server started at ${new Date().toISOString()}`);
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Press Ctrl+C to shutdown');
});