/* jslint node:true */

'use strict';

var assert = require('assert'),
    async = require('async'),
    fs = require('fs'),
    util = require('util');

function TaskQueue(context, tasks) {
    this.context = context;
    this.tasks = tasks;
    this.index = 0;
    this.finished = false;
    this.taskDone = false;
}

TaskQueue.prototype.run = function (callback) {
    var that = this;

    if (this.tasks.length <= this.index) {
        console.log('TaskQueue with context %s is done.', this.context.name);
        this.finished = true;
        return callback();
    }

    var taskName = this.tasks[this.index];
    var task = null;

    if (taskName === 'A') task = new A(this);
    if (taskName === 'B') task = new B(this);
    if (taskName === 'C') task = new C(this);

    console.log('Handle task %s for object %s. Done: %s', task._id, this.context.name, this.taskDone);

    function nextTask() {
        ++that.index;

        // reset state
        that.taskDone = false;

        callback();
    }

    if (!this.taskDone) {
        task.do(this.context, function (done, finished) {
            that.taskDone = done;

            if (finished) nextTask();
            else callback();
        });
        return;
    }

    task.check(this.context, function (finished) {
        console.log('Task %s finished? %s', task._id, finished);

        if (finished) nextTask();
        else callback();
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

Task.prototype.check = function (context, callback) {
    console.log('Default check for %s.', this._id);
    callback(false);
};



// Long running async task (will block the taskrunner for a bit)
function A(queue) {
    Task.call(this, queue, 'A');
}
util.inherits(A, Task);

A.prototype.do = function (context, callback) {
    console.log('do A');
    setTimeout(function () { callback(true, true); }, 2000);
};


// Externally (file) dependent task, will recheck endlessly until file is created again
function B(queue) {
    Task.call(this, queue, 'B');
}
util.inherits(B, Task);

B.prototype.do = function (context, callback) {
    console.log('do B');

    fs.unlink(__dirname + '/foo', function () {
        callback(true);
    });
};

B.prototype.check = function (context, callback) {
    console.log('check B');

    var that = this;

    fs.exists(__dirname + '/foo', function (exists) {
        that._queue.taskFinished = exists;
        callback(exists);
    });
};


// task which would needs a state to be saved
function C(queue) {
    Task.call(this, queue, 'C');
}
util.inherits(C, Task);

C.prototype.do = function (context, callback) {
    console.log('do C');

    context.number = (Math.random() * 10).toFixed();

    callback(true);
};

C.prototype.check = function (context, callback) {
    console.log('check C');

    var that = this;

    if (context.number === (Math.random() * 10).toFixed()) {
        callback(true);
    } else {
        callback(false);
    }
};



function loadTaskQueues() {
    var file = fs.readFileSync(__dirname + '/taskQueues.json');
    return JSON.parse(file);
}

function saveTaskQueues(taskQueues) {
    fs.writeFileSync(__dirname + '/taskQueues.json', JSON.stringify(taskQueues));
}

var newTaskQueues = [];

// Task Runner
function next() {
    console.log('===================');
    console.log(' -> Next iteration');

    var newList = [];

    var taskQueues = loadTaskQueues();

    async.eachSeries(taskQueues, function iterator(taskQueue, callback) {
        taskQueue.run(function (error) {
            if (!taskQueue.finished) newList.push(taskQueue);
            callback(error);
        });
    }, function (error) {
        console.log('Iteration done. Error:', error);
        console.log('===================');

        saveTaskQueues(newList.concat(newTaskQueues));
        setTimeout(next, 1000);
    });
}


saveTaskQueues([
    new TaskQueue({ name: 'apple', number: 0 }, [
        'A',
        'C',
        'B'
    ]),
    new TaskQueue({ name: 'banana', number: 0 }, [
        'C',
        'B',
        'A'
    ]),
    new TaskQueue({ name: 'strawberry', number: 0 }, [
        'A',
        'B',
        'C'
    ])
]);

next();

setTimeout(function () {
    newTaskQueues.push(new TaskQueue({ name: 'apple', number: 0 }, [
        'C',
        'B',
        'A'
    ]));
}, 1000);