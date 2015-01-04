/* jslint node:true */

'use strict';

var assert = require('assert'),
    async = require('async'),
    fs = require('fs'),
    uuid = require('uuid'),
    util = require('util');

exports = module.exports = {
    taskQueueFromObject: taskQueueFromObject,

    Task: Task,
    TaskQueueRunner: TaskQueueRunner
};

function taskQueueFromObject(obj, runner) {
    var tasks = runner.availTaskQueues[obj.taskQueueId];
    if (!tasks) throw new Error('No task queue found for id ' + obj.taskQueueId);

    var taskQueue = new TaskQueue(obj.id, obj.taskQueueId, tasks, obj.context);

    taskQueue.index = obj.index;
    taskQueue.taskDone = obj.taskDone;
    taskQueue.backward = !!obj.backward;

    return taskQueue;
}

function TaskQueue(id, taskQueueId, tasks, context) {
    // persistent members
    this.id = id;
    this.taskQueueId = taskQueueId;
    this.context = context;
    this.index = 0;
    this.taskDone = false;
    this.backward = false;

    // runtime members
    this.tasks = tasks;
    this.queueFinished = false;
}

TaskQueue.prototype.toObject = function () {
    return {
        id: this.id,
        taskQueueId: this.taskQueueId,
        context: this.context,
        index: this.index,
        taskDone: this.taskDone,
        backward: this.backward
    };
};

TaskQueue.prototype.revert = function () {
    this.backward = true;
    this.taskDone = false;
};

TaskQueue.prototype.run = function (callback) {
    var that = this;

    // determine if taskqueue is done
    if (!this.backward && this.tasks.length <= this.index) {
        this.queueFinished = true;
        return callback();
    } else if (this.backward && this.index < 0) {
        this.queueFinished = true;
        return callback();
    }

    var task = this.tasks[this.index];

    // Print current state
    var out = this.context.name + '\t\t';
    this.tasks.forEach(function (t, i) {
        out += '| ' + t._id + ' ' + (that.index === i ? (that.backward ? '<' : '>') : ' ') + ' ';
    });
    out += '|';
    console.log(out);

    // proceed to next task in the queue
    function nextTask() {
        that.index += that.backward ? -1 : 1;

        // reset task queue state for next task
        that.taskDone = false;

        callback();
    }

    // perform the task checks in case the task is done
    function checkTask() {
        var check = that.foward ? task.doCheck.bind(task) : task.undoCheck.bind(task);
        check(that.context, function (finished) {
            if (finished) return nextTask();
            callback();
        });
    }

    if (this.taskDone) return checkTask();

    var doUndo = this.foward ? task.do.bind(task) : task.undo.bind(task);
    doUndo(this.context, function (done, finished) {
        that.taskDone = done;

        if (finished) return nextTask();
        checkTask();
    });
};

function Task(id) {
    this._id = id;
}

Task.prototype.do = function (context, callback) {
    callback(true);
};

Task.prototype.undo = function (context, callback) {
    callback(true);
};

Task.prototype.doCheck = function (context, callback) {
    callback(true);
};

Task.prototype.undoCheck = function (context, callback) {
    callback(true);
};



function TaskQueueRunner(interval) {
    this.interval = interval;
    this.newTaskQueues = [];
    this.timeout = null;
    this.availTaskQueues = {};
}

TaskQueueRunner.prototype.loadActiveTaskQueues = function () {
    var that = this;
    var taskQueues = [];

    try {
        var file = fs.readFileSync(__dirname + '/taskQueues2.json');
        var taskQueuesRaw = JSON.parse(file.toString());

        taskQueuesRaw.forEach(function (taskQueueRaw) {
            var obj = null;
            try {
                obj = taskQueueFromObject(taskQueueRaw, that);
                taskQueues.push(obj);
            } catch (e) {
                console.error('Failed to load TaskQueue from raw object.', e);
            }
        });
    } catch (e) {
        console.log('Unable to load taskqueue file.', e);
    }

    return taskQueues;
};

TaskQueueRunner.prototype.saveActiveTaskQueues = function (taskQueues) {
    var out = [];

    taskQueues.forEach(function (queue) {
        out.push(queue.toObject());
    });

    fs.writeFileSync(__dirname + '/taskQueues2.json', JSON.stringify(out));
};

TaskQueueRunner.prototype.registerTaskQueue = function (id, taskQueue) {
    this.availTaskQueues[id] = taskQueue;
};

TaskQueueRunner.prototype.unregisterTaskQueue = function (id) {
    delete this.availTaskQueues[id];
};

TaskQueueRunner.prototype.add = function (taskQueueId, context) {
    var tasks = this.availTaskQueues[taskQueueId];
    if (!tasks) throw new Error('No task queue found for id ' + taskQueueId);

    var taskQueue = new TaskQueue(uuid.v4(), taskQueueId, tasks, context);

    this.newTaskQueues.push(taskQueue);
};

TaskQueueRunner.prototype.next = function () {
    var that = this;

    console.log();
    console.log(' -> Next iteration.');

    var newList = [];

    var activeTaskQueues = this.loadActiveTaskQueues();

    async.eachSeries(activeTaskQueues, function iterator(taskQueue, callback) {

        // randomness to let it go backwards
        if (!taskQueue.backward && (Math.random() < 0.1)) taskQueue.revert();

        taskQueue.run(function (error) {
            if (error) console.log('TaskQueue failed to run:', error);
            else if (!taskQueue.queueFinished) newList.push(taskQueue);
            callback();
        });
    }, function (error) {
        console.log(' -> Iteration done.', error ? error : '');
        console.log();

        that.saveActiveTaskQueues(newList.concat(that.newTaskQueues));
        that.newTaskQueues = [];

        that.timeout = setTimeout(that.next.bind(that), that.interval);
    });
};

TaskQueueRunner.prototype.start = function () {
    this.timeout = setTimeout(this.next.bind(this), 0);
};

TaskQueueRunner.prototype.stop = function () {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
};

