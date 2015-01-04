/* jslint node:true */

'use strict';

var assert = require('assert'),
    async = require('async'),
    fs = require('fs'),
    util = require('util');

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

    var taskName = this.tasks[this.index];
    var task = null;

    if (taskName === 'A') task = new A(this);
    if (taskName === 'B') task = new B(this);
    if (taskName === 'C') task = new C(this);

    if (!task) return callback(new Error('No such task'));

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
    console.log('Default do for %s.', this._id);
    callback(true);
};

Task.prototype.undo = function (context, callback) {
    console.log('Default undo for %s.', this._id);
    callback(true);
};

Task.prototype.doCheck = function (context, callback) {
    console.log('Default doCheck for %s.', this._id);
    callback(true);
};

Task.prototype.undoCheck = function (context, callback) {
    console.log('Default undoCheck for %s.', this._id);
    callback(true);
};



// Long running async task (will block the taskrunner for a bit)
function A(queue) {
    Task.call(this, queue, 'A');
}
util.inherits(A, Task);

A.prototype.do = function (context, callback) {
    setTimeout(function () { callback(true, true); }, 2000);
};


// Externally (file) dependent task, will recheck endlessly until file is created again
function B(queue) {
    Task.call(this, queue, 'B');
}
util.inherits(B, Task);

B.prototype.do = function (context, callback) {
    fs.unlink(__dirname + '/forwards', function () {
        callback(true);
    });
};

B.prototype.doCheck = function (context, callback) {
    var that = this;

    fs.exists(__dirname + '/forwards', function (exists) {
        callback(exists);
    });
};

B.prototype.undo = function (context, callback) {
    fs.unlink(__dirname + '/backwards', function () {
        callback(true);
    });
};

B.prototype.undoCheck = function (context, callback) {
    var that = this;

    fs.exists(__dirname + '/backwards', function (exists) {
        callback(exists);
    });
};


// task which would needs a state to be saved
function C(queue) {
    Task.call(this, queue, 'C');
}
util.inherits(C, Task);

C.prototype.do = function (context, callback) {
    context.number = (Math.random() * 10).toFixed();

    callback(true);
};

C.prototype.undo = function (context, callback) {
    context.number = (Math.random() * 10).toFixed();

    callback(true);
};

C.prototype.doCheck = function (context, callback) {
    var that = this;

    if (context.number === (Math.random() * 10).toFixed()) {
        callback(true);
    } else {
        callback(false);
    }
};

C.prototype.undoCheck = function (context, callback) {
    var that = this;

    if (context.number === (Math.random() * 10).toFixed()) {
        callback(true);
    } else {
        callback(false);
    }
};



function loadTaskQueues() {
    var file = fs.readFileSync(__dirname + '/taskQueues.json');
    var taskQueuesRaw = JSON.parse(file.toString());
    var taskQueues = [];

    taskQueuesRaw.forEach(function (taskQueueRaw) {
        taskQueues.push(taskQueueFromObject(taskQueueRaw));
    });

    return taskQueues;
}

function saveTaskQueues(taskQueues) {
    fs.writeFileSync(__dirname + '/taskQueues.json', JSON.stringify(taskQueues));
}

var newTaskQueues = [];

// Task Runner
function next() {
    console.log();
    console.log('======================================');
    console.log(' -> Next iteration');

    var newList = [];

    var taskQueues = loadTaskQueues();

    async.eachSeries(taskQueues, function iterator(taskQueue, callback) {

        // randomness to let it go backwards
        if (!taskQueue.backward && (Math.random() < 0.1)) taskQueue.revert();

        taskQueue.run(function (error) {
            if (!taskQueue.queueFinished) newList.push(taskQueue);
            callback(error);
        });
    }, function (error) {
        console.log('Iteration done');
        console.log('======================================');
        console.log();

        saveTaskQueues(newList.concat(newTaskQueues));
        newTaskQueues = [];
        setTimeout(next, 1000);
    });
}


// Initial task queues
saveTaskQueues([
    new TaskQueue({ name: 'apple', number: 0 }, [
        'A',
        'A',
        'C',
        'A',
        'C',
        'B'
    ]),
    new TaskQueue({ name: 'banana', number: 0 }, [
        'C',
        'B',
        'C',
        'C',
        'A'
    ]),
    new TaskQueue({ name: 'berry', number: 0 }, [
        'A',
        'A',
        'A',
        'B',
        'C',
        'C'
    ])
]);

next();

setTimeout(function () {
    newTaskQueues.push(new TaskQueue({ name: 'peach', number: 0 }, [
        'C',
        'B',
        'A'
    ]));
}, 10000);