
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/user');
const Task = require('../models/task');

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

// -------------------- GET /api/users --------------------
router.get('/', async (req, res) => {
  try {
    const { where, sort, select, skip, limit, count } = req.query;
    const filter = parseJSONParam(where, {});
    const projection = parseSelect(select);
    const sortBy = parseSort(sort);
    const skipNum = Math.max(0, parseInt(skip || '0', 10));
    const limitNum = limit ? Math.max(0, parseInt(limit, 10)) : 0;

    if (String(count) === 'true') {
      const c = await User.countDocuments(filter);
      return sendOK(res, { count: c });
    }

    let q = User.find(filter);
    if (projection) q = q.select(projection);
    if (sortBy) q = q.sort(sortBy);
    if (limitNum > 0) q = q.limit(limitNum);
    q = q.skip(skipNum);

    const users = await q.exec();
    return sendOK(res, users);
  } catch (err) {
    console.error('GET /api/users error:', err);
    return sendError(res, 'Error fetching users', 500, err.message);
  }
});

// -------------------- GET /api/users/:id --------------------
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { select } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, 'Invalid user id', 400);
    }

    const projection = parseSelect(select);
    const user = await User.findById(id).select(projection || '').exec();
    if (!user) return sendError(res, 'User not found', 404);

    return sendOK(res, user);
  } catch (err) {
    console.error('GET /api/users/:id error:', err);
    return sendError(res, 'Error fetching user', 500, err.message);
  }
});

// -------------------- POST /api/users --------------------
router.post('/', async (req, res) => {
  try {
    const { name, email, pendingTasks } = req.body;

    // 1 - validate required fields
    if (!name || !email) {
      return sendError(res, 'Missing required fields: name and email', 400);
    }

    // 2 - validate duplicates
    const existing = await User.findOne({ email }).exec();
    if (existing) {
      return sendError(res, 'Email already exists', 400);
    }

    // 3 - create user
    const user = await User.create({
      name,
      email,
      pendingTasks: pendingTasks || [],
    });

    return sendCreated(res, user);

  } catch (err) {
    console.error('POST /api/users error:', err);
    // 4- message of generic error
    return sendError(res, 'Server error while creating user', 500, err.message);
  }
});

// -------------------- PUT /api/users/:id --------------------
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, 'Invalid user id', 400);
    }

    const updates = {};
    const allowed = ['name', 'email', 'pendingTasks'];
    allowed.forEach(k => {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    });

    const user = await User.findById(id);
    if (!user) return sendError(res, 'User not found', 404);

    // synchronize pendingTasks with Task model
    if (updates.pendingTasks) {
      const oldTasks = user.pendingTasks || [];
      const newTasks = updates.pendingTasks || [];

      for (const tid of oldTasks) {
        if (!newTasks.includes(tid)) {
          await Task.findByIdAndUpdate(tid, {
            assignedUser: '',
            assignedUserName: 'unassigned',
          });
        }
      }

      for (const tid of newTasks) {
        const t = await Task.findById(tid);
        if (t) {
          t.assignedUser = user._id.toString();
          t.assignedUserName = user.name;
          await t.save();
        }
      }
    }

    Object.assign(user, updates);
    await user.save();

    return sendOK(res, user);
  } catch (err) {
    console.error('PUT /api/users/:id error:', err);
    return sendError(res, 'Error updating user', 500, err.message);
  }
});

// -------------------- DELETE /api/users/:id --------------------
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, 'Invalid user id', 400);
    }

    const user = await User.findByIdAndDelete(id).exec();
    if (!user) return sendError(res, 'User not found', 404);

    await Task.updateMany(
      { assignedUser: id },
      { assignedUser: '', assignedUserName: 'unassigned' }
    ).exec();

    return sendOK(res, user);
  } catch (err) {
    console.error('DELETE /api/users/:id error:', err);
    return sendError(res, 'Error deleting user', 500, err.message);
  }
});

module.exports = router;
