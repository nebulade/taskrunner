/* jslint node:true */

'use strict';

var assert = require('assert'),
    async = require('async'),
    fs = require('fs'),
    util = require('util');

exports = module.exports = {
    taskQueueFromObject: taskQueueFromObject,

    Task: Task,
    TaskQueue: TaskQueue,
    TaskQueueRunner: TaskQueueRunner
};

function taskQueueFromObject(obj) {
    var taskQueue = new TaskQueue(obj.context, obj.tasks);
    taskQueue.index = obj.index;
    taskQueue.taskDone = obj.taskDone;
    taskQueue.backward = !!obj.backward;
    return taskQueue;
}

function TaskQueue(context, tasks) {
    // persistent members
    this.context = context;
    this.tasks = tasks;
    this.index = 0;
    this.taskDone = false;
    this.backward = false;

    // runtime members
    this.queueFinished = false;
}

TaskQueue.prototype.revert = function () {
    this.backward = true;
    this.taskDone = false;
};

TaskQueue.prototype.run = function (runner, callback) {
    var that = this;

    // determine if taskqueue is done
    if (!this.backward && this.tasks.length <= this.index) {
        this.queueFinished = true;
        return callback();
    } else if (this.backward && this.index < 0) {
        this.queueFinished = true;
        return callback();
    }

    var taskId = this.tasks[this.index];
    if (!runner.availTasks[taskId]) return callback(new Error('No such task ' + taskId));
    var task = new (runner.availTasks[taskId])(this);

    // Print current state
    var out = this.context.name + '\t\t';
    this.tasks.forEach(function (t, i) {
        out += '| ' + t + ' ' + (that.index === i ? (that.backward ? '<' : '>') : ' ') + ' ';
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

function Task(queue, id) {
    this._id = id;
    this._queue = queue;
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
    this.availTasks = {};
}

TaskQueueRunner.prototype.loadTaskQueues = function () {
    var taskQueues = [];

    try {
        var file = fs.readFileSync(__dirname + '/taskQueues.json');
        var taskQueuesRaw = JSON.parse(file.toString());

        taskQueuesRaw.forEach(function (taskQueueRaw) {
            var obj = null;
            try {
                obj = taskQueueFromObject(taskQueueRaw);
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

TaskQueueRunner.prototype.saveTaskQueues = function (taskQueues) {
    fs.writeFileSync(__dirname + '/taskQueues.json', JSON.stringify(taskQueues));
};

TaskQueueRunner.prototype.registerTask = function (id, task) {
    this.availTasks[id] = task;
};

TaskQueueRunner.prototype.unregisterTask = function (id) {
    delete this.availTasks[id];
};

TaskQueueRunner.prototype.add = function (taskQueue) {
    this.newTaskQueues.push(taskQueue);
};

TaskQueueRunner.prototype.next = function () {
    var that = this;

    console.log();
    console.log(' -> Next iteration.');

    var newList = [];

    var taskQueues = this.loadTaskQueues();

    async.eachSeries(taskQueues, function iterator(taskQueue, callback) {

        // randomness to let it go backwards
        if (!taskQueue.backward && (Math.random() < 0.1)) taskQueue.revert();

        taskQueue.run(that, function (error) {
            if (error) console.log('TaskQueue failed to run:', error);
            else if (!taskQueue.queueFinished) newList.push(taskQueue);
            callback();
        });
    }, function (error) {
        console.log(' -> Iteration done.', error ? error : '');
        console.log();

        that.saveTaskQueues(newList.concat(that.newTaskQueues));
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

