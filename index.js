/* jslint node:true */

'use strict';

var assert = require('assert'),
    async = require('async'),
    fs = require('fs'),
    util = require('util');

function TaskQueue(context, queue) {
    this.context = context;
    this.queue = queue;
    this.index = 0;
    this.finished = false;
}

TaskQueue.prototype.run = function (callback) {
    var that = this;

    if (this.queue.length <= this.index) {
        console.log('TaskQueue with context %s is done.', this.context.name);
        this.finished = true;
        return callback();
    }

    var task = this.queue[this.index];

    console.log('Handle task %s for object %s. Done: %s Finished: %s', task._id, this.context.name, task._done, task._finished);

    if (!task.isDone()) {
        this.queue[this.index].do(this.context, callback);
        return;
    }

    if (!task.isFinished()) {
        task.check(this.context, function (finished) {
            console.log('task check resulted in %s', finished);

            if (finished) {
                // done and finished
                ++that.index;
            }

            callback();
        });
        return;
    }

    // done and finished
    ++this.index;
    callback();
};

function Task(id) {
    this._id = id;
    this._done = false;
    this._finished = false;
    this._timeout = 10000;
    this._finishedTimeout = null;
}

Task.prototype.isDone = function () {
    return this._done;
};

Task.prototype.done = function () {
    this._done = true;
    this._finishedTimeout = Date.now() + (this._timeout * 1000);
};

Task.prototype.isFinished = function () {
    return this._finished;
};

Task.prototype.do = function (context, callback) {
    console.log('Default do for %s.', this._id);
    this.done();
    callback();
};

Task.prototype.check = function (context, callback) {
    console.log('Default check for %s.', this._id);
    callback(false);
};


// Specialized tasks
function A() {
    Task.call(this, 'A');
}
util.inherits(A, Task);

A.prototype.do = function (context, callback) {
    console.log('do A');

    var that = this;

    setTimeout(function () { that._finished = true; }, 10000);

    this.done();
    callback();
};


function B() {
    Task.call(this, 'B');
}
util.inherits(B, Task);

B.prototype.do = function (context, callback) {
    console.log('do B');

    this.done();
    callback();
};

B.prototype.check = function (context, callback) {
    console.log('check B');

    var that = this;

    fs.exists(__dirname + '/foo', function (exists) {
        that._finished = exists;
        callback(exists);
    });
};

function C() {
    Task.call(this, 'C');
    this.number = 0;
}
util.inherits(C, Task);

C.prototype.do = function (context, callback) {
    console.log('do C');

    this.number = (Math.random() * 10).toFixed();
    this.done();
    callback();
};

C.prototype.check = function (context, callback) {
    console.log('check C');

    var that = this;

    if (this.number === (Math.random() * 10).toFixed()) {
        this._finished = true;
    }

    callback();
};




var taskQueues = [
    new TaskQueue({ name: 'apple' }, [
        new A(),
        new C(),
        new B()
    ]),
    new TaskQueue({ name: 'banana' }, [
        new C(),
        new B(),
        new A()
    ]),
    new TaskQueue({ name: 'strawberry' }, [
        new A(),
        new B(),
        new C()
    ])
];
var newTaskQueues = [];

// Task Runner
function next() {
    console.log('===================');
    console.log(' -> Next iteration');

    var newList = [];

    async.eachSeries(taskQueues, function iterator(taskQueue, callback) {
        taskQueue.run(function (error) {
            if (!taskQueue.finished) newList.push(taskQueue);
            callback(error);
        });
    }, function (error) {
        console.log('Iteration done. Error:', error);
        console.log('===================');

        taskQueues = newList.concat(newTaskQueues);
        newTaskQueues = [];
        setTimeout(next, 1000);
    });
}

next();

setTimeout(function () {
    newTaskQueues.push(new TaskQueue({ name: 'apple' }, [
        new A(),
        new B()
    ]));
}, 1000);