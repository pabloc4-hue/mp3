const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Task = require('../models/task');
const User = require('../models/user');

// -------------------- Helper functions --------------------
function sendOK(res, data, status = 200) {
  return res.status(status).json({ message: 'OK', data });
}
function sendCreated(res, data) {
  return res.status(201).json({ message: 'Created', data });
}
function sendError(res, message = 'Error', status = 400, data = null) {
  return res.status(status).json({ message, data });
}
function parseJSONParam(str, fallback = {}) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
function parseSelect(selectStr) {
  if (!selectStr) return null;
  return selectStr.split(/[\s,]+/).join(' ');
}
function parseSort(sortStr) {
  if (!sortStr) return null;
  return sortStr.split(/[\s,]+/).join(' ');
}

// -------------------- GET /api/tasks --------------------
router.get('/', async (req, res) => {
  try {
    const { where, sort, select, skip, limit, count } = req.query;
    const filter = parseJSONParam(where, {});
    const projection = parseSelect(select);
    const sortBy = parseSort(sort);
    const skipNum = Math.max(0, parseInt(skip || '0', 10));
    const limitNum = Math.min(1000, Math.max(0, parseInt(limit || '100', 10)));

    if (String(count) === 'true') {
      const c = await Task.countDocuments(filter);
      return sendOK(res, { count: c });
    }

    let q = Task.find(filter);
    if (projection) q = q.select(projection);
    if (sortBy) q = q.sort(sortBy);
    q = q.skip(skipNum).limit(limitNum);

    const tasks = await q.exec();
    return sendOK(res, tasks);
  } catch (err) {
    console.error('GET /api/tasks error:', err);
    return sendError(res, 'Error fetching tasks', 500, err.message);
  }
});

// -------------------- GET /api/tasks/:id --------------------
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { select } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, 'Invalid task id', 400);
    }

    const projection = parseSelect(select);
    const task = await Task.findById(id).select(projection || '').exec();
    if (!task) return sendError(res, 'Task not found', 404);

    return sendOK(res, task);
  } catch (err) {
    console.error('GET /api/tasks/:id error:', err);
    return sendError(res, 'Error fetching task', 500, err.message);
  }
});

// -------------------- POST /api/tasks --------------------
router.post('/', async (req, res) => {
  try {
    const { name, description, deadline, completed, assignedUser, assignedUserName } = req.body;
    const validDeadline = isNaN(Date.parse(deadline)) ? new Date() : new Date(deadline);
    if (!name || !validDeadline) {
      return sendError(res, 'Missing required fields: name and deadline', 400);
    }

    const taskData = {
      name,
      description: description || '',
      deadline: isNaN(new Date(deadline)) ? new Date() : new Date(deadline),
      completed: !!completed,
      assignedUser: assignedUser || '',
      assignedUserName: assignedUserName || (assignedUser ? 'unknown' : 'unassigned'),
    };

    const task = await Task.create(taskData);

    if (assignedUser) {
      const user = await User.findById(assignedUser);
      if (user) {
        task.assignedUserName = user.name;
        await task.save();
        await User.findByIdAndUpdate(user._id, { $addToSet: { pendingTasks: task._id.toString() } });
      }
    }

    return sendCreated(res, task);
  } catch (err) {
    console.error('POST /api/tasks error:', err);
    return sendError(res, 'Error creating task', 500, err.message);
  }
});

// -------------------- PUT /api/tasks/:id --------------------
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, 'Invalid task id', 400);
    }

    const updates = {};
    const allowed = ['name', 'description', 'deadline', 'completed', 'assignedUser', 'assignedUserName'];
    allowed.forEach(k => {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    });

    const task = await Task.findById(id);
    if (!task) return sendError(res, 'Task not found', 404);

    const prevUser = task.assignedUser;
    const newUser = updates.assignedUser !== undefined ? updates.assignedUser : prevUser;

    Object.assign(task, updates);
    if (updates.deadline) task.deadline = new Date(updates.deadline);
    await task.save();

    // sync with users
    if (prevUser !== newUser) {
      if (prevUser) await User.findByIdAndUpdate(prevUser, { $pull: { pendingTasks: task._id.toString() } });
      if (newUser) {
        const user = await User.findById(newUser);
        if (user) {
          task.assignedUserName = user.name;
          await task.save();
          await User.findByIdAndUpdate(newUser, { $addToSet: { pendingTasks: task._id.toString() } });
        }
      }
    }

    return sendOK(res, task);
  } catch (err) {
    console.error('PUT /api/tasks/:id error:', err);
    return sendError(res, 'Error updating task', 500, err.message);
  }
});

// -------------------- DELETE /api/tasks/:id --------------------
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, 'Invalid task id', 400);
    }

    const task = await Task.findByIdAndDelete(id).exec();
    if (!task) return sendError(res, 'Task not found', 404);

    if (task.assignedUser) {
      await User.findByIdAndUpdate(task.assignedUser, { $pull: { pendingTasks: task._id.toString() } });
    }

    return sendOK(res, task);
  } catch (err) {
    console.error('DELETE /api/tasks/:id error:', err);
    return sendError(res, 'Error deleting task', 500, err.message);
  }
});

module.exports = router;
