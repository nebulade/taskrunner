/* jslint node:true */

'use strict';

var assert = require('assert'),
    async = require('async'),
    fs = require('fs'),
    tasks = require('./tasks2.js'),
    TaskQueueRunner = tasks.TaskQueueRunner,
    TaskQueue = tasks.TaskQueue,
    Task = tasks.Task,
    util = require('util');


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
    context.number = Math.floor((Math.random() * 10));

    callback(true);
};

C.prototype.undo = function (context, callback) {
    context.number = Math.floor((Math.random() * 10));

    callback(true);
};

C.prototype.doCheck = function (context, callback) {
    var that = this;

    if (context.number === Math.floor((Math.random() * 10))) {
        callback(true);
    } else {
        callback(false);
    }
};

C.prototype.undoCheck = function (context, callback) {
    var that = this;

    if (context.number === Math.floor((Math.random() * 10))) {
        callback(true);
    } else {
        callback(false);
    }
};

var taskQueueRunner = new TaskQueueRunner(1000);

taskQueueRunner.registerTaskQueue('QA', [
    new A(),
    new A(),
    new C(),
    new A(),
    new C(),
    new B()
]);

taskQueueRunner.registerTaskQueue('QB', [
    new C(),
    new B(),
    new C(),
    new C(),
    new A()
]);

taskQueueRunner.registerTaskQueue('QC', [
    new A(),
    new A(),
    new A(),
    new B(),
    new C(),
    new C()
]);

// Initial task queues
taskQueueRunner.add('QA', { name: 'apple', number: 0 });
taskQueueRunner.add('QB', { name: 'banana', number: 0 });
taskQueueRunner.add('QC', { name: 'coco', number: 0 });

taskQueueRunner.start();

// setTimeout(function () {
//     taskQueueRunner.add(new TaskQueue({ name: 'peach', number: 0 }, [
//         new C(),
//         new B(),
//         new A()
//     ]));
// }, 10000);