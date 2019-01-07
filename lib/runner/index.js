'use strict';

exports.__esModule = true;

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _path = require('path');

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _pinkie = require('pinkie');

var _pinkie2 = _interopRequireDefault(_pinkie);

var _promisifyEvent = require('promisify-event');

var _promisifyEvent2 = _interopRequireDefault(_promisifyEvent);

var _mapReverse = require('map-reverse');

var _mapReverse2 = _interopRequireDefault(_mapReverse);

var _events = require('events');

var _lodash = require('lodash');

var _bootstrapper = require('./bootstrapper');

var _bootstrapper2 = _interopRequireDefault(_bootstrapper);

var _reporter = require('../reporter');

var _reporter2 = _interopRequireDefault(_reporter);

var _task = require('./task');

var _task2 = _interopRequireDefault(_task);

var _runtime = require('../errors/runtime');

var _message = require('../errors/runtime/message');

var _message2 = _interopRequireDefault(_message);

var _typeAssertions = require('../errors/runtime/type-assertions');

var _renderForbiddenCharsList = require('../errors/render-forbidden-chars-list');

var _renderForbiddenCharsList2 = _interopRequireDefault(_renderForbiddenCharsList);

var _checkFilePath = require('../utils/check-file-path');

var _checkFilePath2 = _interopRequireDefault(_checkFilePath);

var _handleErrors = require('../utils/handle-errors');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const DEFAULT_SELECTOR_TIMEOUT = 10000;
const DEFAULT_ASSERTION_TIMEOUT = 3000;
const DEFAULT_PAGE_LOAD_TIMEOUT = 3000;

const DEBUG_LOGGER = (0, _debug2.default)('testcafe:runner');

class Runner extends _events.EventEmitter {
    constructor(proxy, browserConnectionGateway, options = {}) {
        super();

        this.proxy = proxy;
        this.bootstrapper = new _bootstrapper2.default(browserConnectionGateway);
        this.pendingTaskPromises = [];

        this.opts = {
            externalProxyHost: null,
            proxyBypass: null,
            screenshotPath: null,
            takeScreenshotsOnFails: false,
            recordScreenCapture: false,
            screenshotPathPattern: null,
            skipJsErrors: false,
            quarantineMode: false,
            debugMode: false,
            retryTestPages: options.retryTestPages,
            selectorTimeout: DEFAULT_SELECTOR_TIMEOUT,
            pageLoadTimeout: DEFAULT_PAGE_LOAD_TIMEOUT
        };
    }

    static _disposeBrowserSet(browserSet) {
        return browserSet.dispose().catch(e => DEBUG_LOGGER(e));
    }

    static _disposeReporters(reporters) {
        return _pinkie2.default.all(reporters.map(reporter => reporter.dispose().catch(e => DEBUG_LOGGER(e))));
    }

    static _disposeTestedApp(testedApp) {
        return testedApp ? testedApp.kill().catch(e => DEBUG_LOGGER(e)) : _pinkie2.default.resolve();
    }

    static _disposeTaskAndRelatedAssets(task, browserSet, reporters, testedApp) {
        return (0, _asyncToGenerator3.default)(function* () {
            task.abort();
            task.clearListeners();

            yield Runner._disposeAssets(browserSet, reporters, testedApp);
        })();
    }

    static _disposeAssets(browserSet, reporters, testedApp) {
        return _pinkie2.default.all([Runner._disposeBrowserSet(browserSet), Runner._disposeReporters(reporters), Runner._disposeTestedApp(testedApp)]);
    }

    _createCancelablePromise(taskPromise) {
        const promise = taskPromise.then(({ completionPromise }) => completionPromise);
        const removeFromPending = () => (0, _lodash.pull)(this.pendingTaskPromises, promise);

        promise.then(removeFromPending).catch(removeFromPending);

        promise.cancel = () => taskPromise.then(({ cancelTask }) => cancelTask()).then(removeFromPending);

        this.pendingTaskPromises.push(promise);
        return promise;
    }

    // Run task
    _getFailedTestCount(task, reporter) {
        let failedTestCount = reporter.testCount - reporter.passed;

        if (task.opts.stopOnFirstFail && !!failedTestCount) failedTestCount = 1;

        return failedTestCount;
    }

    _getTaskResult(task, browserSet, reporters, testedApp) {
        var _this = this;

        return (0, _asyncToGenerator3.default)(function* () {
            task.on('browser-job-done', function (job) {
                return browserSet.releaseConnection(job.browserConnection);
            });

            const promises = [task.once('done'), (0, _promisifyEvent2.default)(browserSet, 'error')];

            if (testedApp) promises.push(testedApp.errorPromise);

            try {
                yield _pinkie2.default.race(promises);
            } catch (err) {
                yield Runner._disposeTaskAndRelatedAssets(task, browserSet, reporters, testedApp);

                throw err;
            }

            yield Runner._disposeAssets(browserSet, reporters, testedApp);

            return _this._getFailedTestCount(task, reporters[0]);
        })();
    }

    _runTask(reporterPlugins, browserSet, tests, testedApp) {
        let completed = false;
        const task = new _task2.default(tests, browserSet.browserConnectionGroups, this.proxy, this.opts);
        const reporters = reporterPlugins.map(reporter => new _reporter2.default(reporter.plugin, task, reporter.outStream));
        const completionPromise = this._getTaskResult(task, browserSet, reporters, testedApp);

        task.on('start', _handleErrors.startHandlingTestErrors);

        if (!this.opts.skipUncaughtErrors) {
            task.once('test-run-start', _handleErrors.addRunningTest);
            task.once('test-run-done', _handleErrors.removeRunningTest);
        }

        task.on('done', _handleErrors.stopHandlingTestErrors);

        const setCompleted = () => {
            completed = true;
        };

        completionPromise.then(setCompleted).catch(setCompleted);

        const cancelTask = (() => {
            var _ref = (0, _asyncToGenerator3.default)(function* () {
                if (!completed) yield Runner._disposeTaskAndRelatedAssets(task, browserSet, reporters, testedApp);
            });

            return function cancelTask() {
                return _ref.apply(this, arguments);
            };
        })();

        return { completionPromise, cancelTask };
    }

    _registerAssets(assets) {
        assets.forEach(asset => this.proxy.GET(asset.path, asset.info));
    }

    _validateSpeedOption() {
        const speed = this.opts.speed;

        if (typeof speed !== 'number' || isNaN(speed) || speed < 0.01 || speed > 1) throw new _runtime.GeneralError(_message2.default.invalidSpeedValue);
    }

    _validateConcurrencyOption() {
        const concurrency = this.bootstrapper.concurrency;

        if (typeof concurrency !== 'number' || isNaN(concurrency) || concurrency < 1) throw new _runtime.GeneralError(_message2.default.invalidConcurrencyFactor);
    }

    _validateProxyBypassOption() {
        let proxyBypass = this.opts.proxyBypass;

        if (!proxyBypass) return;

        (0, _typeAssertions.assertType)([_typeAssertions.is.string, _typeAssertions.is.array], null, '"proxyBypass" argument', proxyBypass);

        if (typeof proxyBypass === 'string') proxyBypass = [proxyBypass];

        proxyBypass = proxyBypass.reduce((arr, rules) => {
            (0, _typeAssertions.assertType)(_typeAssertions.is.string, null, '"proxyBypass" argument', rules);

            return arr.concat(rules.split(','));
        }, []);

        this.opts.proxyBypass = proxyBypass;
    }

    _validateScreenshotOptions() {
        const screenshotPath = this.opts.screenshotPath;
        const screenshotPathPattern = this.opts.screenshotPathPattern;

        if (screenshotPath) {
            this._validateScreenshotPath(screenshotPath, 'screenshots base directory path');

            this.opts.screenshotPath = (0, _path.resolve)(screenshotPath);
        }

        if (screenshotPathPattern) this._validateScreenshotPath(screenshotPathPattern, 'screenshots path pattern');

        if (!screenshotPath && screenshotPathPattern) throw new _runtime.GeneralError(_message2.default.cantUseScreenshotPathPatternWithoutBaseScreenshotPathSpecified);
    }

    _validateRunOptions() {
        this._validateScreenshotOptions();
        this._validateSpeedOption();
        this._validateConcurrencyOption();
        this._validateProxyBypassOption();
    }

    _validateScreenshotPath(screenshotPath, pathType) {
        const forbiddenCharsList = (0, _checkFilePath2.default)(screenshotPath);

        if (forbiddenCharsList.length) throw new _runtime.GeneralError(_message2.default.forbiddenCharatersInScreenshotPath, screenshotPath, pathType, (0, _renderForbiddenCharsList2.default)(forbiddenCharsList));
    }

    // API
    embeddingOptions(opts) {
        this._registerAssets(opts.assets);
        this.opts.TestRunCtor = opts.TestRunCtor;

        return this;
    }

    src(...sources) {
        this.bootstrapper.sources = this.bootstrapper.sources.concat((0, _lodash.flattenDeep)(sources));

        return this;
    }

    browsers(...browsers) {
        this.bootstrapper.browsers = this.bootstrapper.browsers.concat((0, _lodash.flattenDeep)(browsers));

        return this;
    }

    concurrency(concurrency) {
        this.bootstrapper.concurrency = concurrency;

        return this;
    }

    reporter(name, outStream) {
        this.bootstrapper.reporters.push({
            name,
            outStream
        });

        return this;
    }

    filter(filter) {
        this.bootstrapper.filter = filter;

        return this;
    }

    useProxy(externalProxyHost, proxyBypass) {
        this.opts.externalProxyHost = externalProxyHost;
        this.opts.proxyBypass = proxyBypass;

        return this;
    }

    screenshots(path, takeOnFails = false, pattern = null, recordScreenCapture = false) {
        this.opts.takeScreenshotsOnFails = takeOnFails;
        this.opts.screenshotPath = path;
        this.opts.screenshotPathPattern = pattern;
        this.opts.recordScreenCapture = recordScreenCapture;

        return this;
    }

    startApp(command, initDelay) {
        this.bootstrapper.appCommand = command;
        this.bootstrapper.appInitDelay = initDelay;

        return this;
    }

    run({ skipJsErrors, disablePageReloads, quarantineMode, debugMode, selectorTimeout, assertionTimeout, pageLoadTimeout, speed = 1, debugOnFail, skipUncaughtErrors, stopOnFirstFail, disableTestSyntaxValidation } = {}) {
        this.opts.skipJsErrors = !!skipJsErrors;
        this.opts.disablePageReloads = !!disablePageReloads;
        this.opts.quarantineMode = !!quarantineMode;
        this.opts.debugMode = !!debugMode;
        this.opts.debugOnFail = !!debugOnFail;
        this.opts.selectorTimeout = selectorTimeout === void 0 ? DEFAULT_SELECTOR_TIMEOUT : selectorTimeout;
        this.opts.assertionTimeout = assertionTimeout === void 0 ? DEFAULT_ASSERTION_TIMEOUT : assertionTimeout;
        this.opts.pageLoadTimeout = pageLoadTimeout === void 0 ? DEFAULT_PAGE_LOAD_TIMEOUT : pageLoadTimeout;
        this.opts.speed = speed;
        this.opts.skipUncaughtErrors = !!skipUncaughtErrors;
        this.opts.stopOnFirstFail = !!stopOnFirstFail;

        this.bootstrapper.disableTestSyntaxValidation = disableTestSyntaxValidation;

        const runTaskPromise = _pinkie2.default.resolve().then(() => {
            this._validateRunOptions();

            return this.bootstrapper.createRunnableConfiguration();
        }).then(({ reporterPlugins, browserSet, tests, testedApp }) => {
            this.emit('done-bootstrapping');

            return this._runTask(reporterPlugins, browserSet, tests, testedApp);
        });

        return this._createCancelablePromise(runTaskPromise);
    }

    stop() {
        var _this2 = this;

        return (0, _asyncToGenerator3.default)(function* () {
            // NOTE: When taskPromise is cancelled, it is removed from
            // the pendingTaskPromises array, which leads to shifting indexes
            // towards the beginning. So, we must copy the array in order to iterate it,
            // or we can perform iteration from the end to the beginning.
            const cancellationPromises = (0, _mapReverse2.default)(_this2.pendingTaskPromises, function (taskPromise) {
                return taskPromise.cancel();
            });

            yield _pinkie2.default.all(cancellationPromises);
        })();
    }
}
exports.default = Runner;
module.exports = exports['default'];
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9ydW5uZXIvaW5kZXguanMiXSwibmFtZXMiOlsiREVGQVVMVF9TRUxFQ1RPUl9USU1FT1VUIiwiREVGQVVMVF9BU1NFUlRJT05fVElNRU9VVCIsIkRFRkFVTFRfUEFHRV9MT0FEX1RJTUVPVVQiLCJERUJVR19MT0dHRVIiLCJSdW5uZXIiLCJFdmVudEVtaXR0ZXIiLCJjb25zdHJ1Y3RvciIsInByb3h5IiwiYnJvd3NlckNvbm5lY3Rpb25HYXRld2F5Iiwib3B0aW9ucyIsImJvb3RzdHJhcHBlciIsIkJvb3RzdHJhcHBlciIsInBlbmRpbmdUYXNrUHJvbWlzZXMiLCJvcHRzIiwiZXh0ZXJuYWxQcm94eUhvc3QiLCJwcm94eUJ5cGFzcyIsInNjcmVlbnNob3RQYXRoIiwidGFrZVNjcmVlbnNob3RzT25GYWlscyIsInJlY29yZFNjcmVlbkNhcHR1cmUiLCJzY3JlZW5zaG90UGF0aFBhdHRlcm4iLCJza2lwSnNFcnJvcnMiLCJxdWFyYW50aW5lTW9kZSIsImRlYnVnTW9kZSIsInJldHJ5VGVzdFBhZ2VzIiwic2VsZWN0b3JUaW1lb3V0IiwicGFnZUxvYWRUaW1lb3V0IiwiX2Rpc3Bvc2VCcm93c2VyU2V0IiwiYnJvd3NlclNldCIsImRpc3Bvc2UiLCJjYXRjaCIsImUiLCJfZGlzcG9zZVJlcG9ydGVycyIsInJlcG9ydGVycyIsIlByb21pc2UiLCJhbGwiLCJtYXAiLCJyZXBvcnRlciIsIl9kaXNwb3NlVGVzdGVkQXBwIiwidGVzdGVkQXBwIiwia2lsbCIsInJlc29sdmUiLCJfZGlzcG9zZVRhc2tBbmRSZWxhdGVkQXNzZXRzIiwidGFzayIsImFib3J0IiwiY2xlYXJMaXN0ZW5lcnMiLCJfZGlzcG9zZUFzc2V0cyIsIl9jcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSIsInRhc2tQcm9taXNlIiwicHJvbWlzZSIsInRoZW4iLCJjb21wbGV0aW9uUHJvbWlzZSIsInJlbW92ZUZyb21QZW5kaW5nIiwiY2FuY2VsIiwiY2FuY2VsVGFzayIsInB1c2giLCJfZ2V0RmFpbGVkVGVzdENvdW50IiwiZmFpbGVkVGVzdENvdW50IiwidGVzdENvdW50IiwicGFzc2VkIiwic3RvcE9uRmlyc3RGYWlsIiwiX2dldFRhc2tSZXN1bHQiLCJvbiIsInJlbGVhc2VDb25uZWN0aW9uIiwiam9iIiwiYnJvd3NlckNvbm5lY3Rpb24iLCJwcm9taXNlcyIsIm9uY2UiLCJlcnJvclByb21pc2UiLCJyYWNlIiwiZXJyIiwiX3J1blRhc2siLCJyZXBvcnRlclBsdWdpbnMiLCJ0ZXN0cyIsImNvbXBsZXRlZCIsIlRhc2siLCJicm93c2VyQ29ubmVjdGlvbkdyb3VwcyIsIlJlcG9ydGVyIiwicGx1Z2luIiwib3V0U3RyZWFtIiwic3RhcnRIYW5kbGluZ1Rlc3RFcnJvcnMiLCJza2lwVW5jYXVnaHRFcnJvcnMiLCJhZGRSdW5uaW5nVGVzdCIsInJlbW92ZVJ1bm5pbmdUZXN0Iiwic3RvcEhhbmRsaW5nVGVzdEVycm9ycyIsInNldENvbXBsZXRlZCIsIl9yZWdpc3RlckFzc2V0cyIsImFzc2V0cyIsImZvckVhY2giLCJhc3NldCIsIkdFVCIsInBhdGgiLCJpbmZvIiwiX3ZhbGlkYXRlU3BlZWRPcHRpb24iLCJzcGVlZCIsImlzTmFOIiwiR2VuZXJhbEVycm9yIiwiTUVTU0FHRSIsImludmFsaWRTcGVlZFZhbHVlIiwiX3ZhbGlkYXRlQ29uY3VycmVuY3lPcHRpb24iLCJjb25jdXJyZW5jeSIsImludmFsaWRDb25jdXJyZW5jeUZhY3RvciIsIl92YWxpZGF0ZVByb3h5QnlwYXNzT3B0aW9uIiwiaXMiLCJzdHJpbmciLCJhcnJheSIsInJlZHVjZSIsImFyciIsInJ1bGVzIiwiY29uY2F0Iiwic3BsaXQiLCJfdmFsaWRhdGVTY3JlZW5zaG90T3B0aW9ucyIsIl92YWxpZGF0ZVNjcmVlbnNob3RQYXRoIiwiY2FudFVzZVNjcmVlbnNob3RQYXRoUGF0dGVybldpdGhvdXRCYXNlU2NyZWVuc2hvdFBhdGhTcGVjaWZpZWQiLCJfdmFsaWRhdGVSdW5PcHRpb25zIiwicGF0aFR5cGUiLCJmb3JiaWRkZW5DaGFyc0xpc3QiLCJsZW5ndGgiLCJmb3JiaWRkZW5DaGFyYXRlcnNJblNjcmVlbnNob3RQYXRoIiwiZW1iZWRkaW5nT3B0aW9ucyIsIlRlc3RSdW5DdG9yIiwic3JjIiwic291cmNlcyIsImJyb3dzZXJzIiwibmFtZSIsImZpbHRlciIsInVzZVByb3h5Iiwic2NyZWVuc2hvdHMiLCJ0YWtlT25GYWlscyIsInBhdHRlcm4iLCJzdGFydEFwcCIsImNvbW1hbmQiLCJpbml0RGVsYXkiLCJhcHBDb21tYW5kIiwiYXBwSW5pdERlbGF5IiwicnVuIiwiZGlzYWJsZVBhZ2VSZWxvYWRzIiwiYXNzZXJ0aW9uVGltZW91dCIsImRlYnVnT25GYWlsIiwiZGlzYWJsZVRlc3RTeW50YXhWYWxpZGF0aW9uIiwicnVuVGFza1Byb21pc2UiLCJjcmVhdGVSdW5uYWJsZUNvbmZpZ3VyYXRpb24iLCJlbWl0Iiwic3RvcCIsImNhbmNlbGxhdGlvblByb21pc2VzIl0sIm1hcHBpbmdzIjoiOzs7Ozs7OztBQUFBOztBQUNBOzs7O0FBQ0E7Ozs7QUFDQTs7OztBQUNBOzs7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7QUFDQTs7OztBQUNBOzs7O0FBQ0E7O0FBQ0E7Ozs7QUFDQTs7QUFDQTs7OztBQUNBOzs7O0FBQ0E7Ozs7QUFHQSxNQUFNQSwyQkFBNEIsS0FBbEM7QUFDQSxNQUFNQyw0QkFBNEIsSUFBbEM7QUFDQSxNQUFNQyw0QkFBNEIsSUFBbEM7O0FBRUEsTUFBTUMsZUFBZSxxQkFBTSxpQkFBTixDQUFyQjs7QUFFZSxNQUFNQyxNQUFOLFNBQXFCQyxvQkFBckIsQ0FBa0M7QUFDN0NDLGdCQUFhQyxLQUFiLEVBQW9CQyx3QkFBcEIsRUFBOENDLFVBQVUsRUFBeEQsRUFBNEQ7QUFDeEQ7O0FBRUEsYUFBS0YsS0FBTCxHQUEyQkEsS0FBM0I7QUFDQSxhQUFLRyxZQUFMLEdBQTJCLElBQUlDLHNCQUFKLENBQWlCSCx3QkFBakIsQ0FBM0I7QUFDQSxhQUFLSSxtQkFBTCxHQUEyQixFQUEzQjs7QUFFQSxhQUFLQyxJQUFMLEdBQVk7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QUFqQztBQUNBLGFBQUtuRSxJQUFMLENBQVU4QyxlQUFWLEdBQStCLENBQUMsQ0FBQ0EsZUFBakM7O0FBRUEsYUFBS2pELFlBQUwsQ0FBa0JnSSwyQkFBbEIsR0FBZ0RBLDJCQUFoRDs7QUFFQSxjQUFNQyxpQkFBaUIxRyxpQkFBUU8sT0FBUixHQUNsQlMsSUFEa0IsQ0FDYixNQUFNO0FBQ1IsaUJBQUtnRSxtQkFBTDs7QUFFQSxtQkFBTyxLQUFLdkcsWUFBTCxDQUFrQmtJLDJCQUFsQixFQUFQO0FBQ0gsU0FMa0IsRUFNbEIzRixJQU5rQixDQU1iLENBQUMsRUFBRXNCLGVBQUYsRUFBbUI1QyxVQUFuQixFQUErQjZDLEtBQS9CLEVBQXNDbEMsU0FBdEMsRUFBRCxLQUF1RDtBQUN6RCxpQkFBS3VHLElBQUwsQ0FBVSxvQkFBVjs7QUFFQSxtQkFBTyxLQUFLdkUsUUFBTCxDQUFjQyxlQUFkLEVBQStCNUMsVUFBL0IsRUFBMkM2QyxLQUEzQyxFQUFrRGxDLFNBQWxELENBQVA7QUFDSCxTQVZrQixDQUF2Qjs7QUFZQSxlQUFPLEtBQUtRLHdCQUFMLENBQThCNkYsY0FBOUIsQ0FBUDtBQUNIOztBQUVLRyxRQUFOLEdBQWM7QUFBQTs7QUFBQTtBQUNWO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esa0JBQU1DLHVCQUF1QiwwQkFBVyxPQUFLbkksbUJBQWhCLEVBQXFDO0FBQUEsdUJBQWVtQyxZQUFZSyxNQUFaLEVBQWY7QUFBQSxhQUFyQyxDQUE3Qjs7QUFFQSxrQkFBTW5CLGlCQUFRQyxHQUFSLENBQVk2RyxvQkFBWixDQUFOO0FBUFU7QUFRYjtBQWpUNEM7a0JBQTVCM0ksTSIsImZpbGUiOiJydW5uZXIvaW5kZXguanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyByZXNvbHZlIGFzIHJlc29sdmVQYXRoIH0gZnJvbSAncGF0aCc7XG5pbXBvcnQgZGVidWcgZnJvbSAnZGVidWcnO1xuaW1wb3J0IFByb21pc2UgZnJvbSAncGlua2llJztcbmltcG9ydCBwcm9taXNpZnlFdmVudCBmcm9tICdwcm9taXNpZnktZXZlbnQnO1xuaW1wb3J0IG1hcFJldmVyc2UgZnJvbSAnbWFwLXJldmVyc2UnO1xuaW1wb3J0IHsgRXZlbnRFbWl0dGVyIH0gZnJvbSAnZXZlbnRzJztcbmltcG9ydCB7IGZsYXR0ZW5EZWVwIGFzIGZsYXR0ZW4sIHB1bGwgYXMgcmVtb3ZlIH0gZnJvbSAnbG9kYXNoJztcbmltcG9ydCBCb290c3RyYXBwZXIgZnJvbSAnLi9ib290c3RyYXBwZXInO1xuaW1wb3J0IFJlcG9ydGVyIGZyb20gJy4uL3JlcG9ydGVyJztcbmltcG9ydCBUYXNrIGZyb20gJy4vdGFzayc7XG5pbXBvcnQgeyBHZW5lcmFsRXJyb3IgfSBmcm9tICcuLi9lcnJvcnMvcnVudGltZSc7XG5pbXBvcnQgTUVTU0FHRSBmcm9tICcuLi9lcnJvcnMvcnVudGltZS9tZXNzYWdlJztcbmltcG9ydCB7IGFzc2VydFR5cGUsIGlzIH0gZnJvbSAnLi4vZXJyb3JzL3J1bnRpbWUvdHlwZS1hc3NlcnRpb25zJztcbmltcG9ydCByZW5kZXJGb3JiaWRkZW5DaGFyc0xpc3QgZnJvbSAnLi4vZXJyb3JzL3JlbmRlci1mb3JiaWRkZW4tY2hhcnMtbGlzdCc7XG5pbXBvcnQgY2hlY2tGaWxlUGF0aCBmcm9tICcuLi91dGlscy9jaGVjay1maWxlLXBhdGgnO1xuaW1wb3J0IHsgYWRkUnVubmluZ1Rlc3QsIHJlbW92ZVJ1bm5pbmdUZXN0LCBzdGFydEhhbmRsaW5nVGVzdEVycm9ycywgc3RvcEhhbmRsaW5nVGVzdEVycm9ycyB9IGZyb20gJy4uL3V0aWxzL2hhbmRsZS1lcnJvcnMnO1xuXG5cbmNvbnN0IERFRkFVTFRfU0VMRUNUT1JfVElNRU9VVCAgPSAxMDAwMDtcbmNvbnN0IERFRkFVTFRfQVNTRVJUSU9OX1RJTUVPVVQgPSAzMDAwO1xuY29uc3QgREVGQVVMVF9QQUdFX0xPQURfVElNRU9VVCA9IDMwMDA7XG5cbmNvbnN0IERFQlVHX0xPR0dFUiA9IGRlYnVnKCd0ZXN0Y2FmZTpydW5uZXInKTtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgUnVubmVyIGV4dGVuZHMgRXZlbnRFbWl0dGVyIHtcbiAgICBjb25zdHJ1Y3RvciAocHJveHksIGJyb3dzZXJDb25uZWN0aW9uR2F0ZXdheSwgb3B0aW9ucyA9IHt9KSB7XG4gICAgICAgIHN1cGVyKCk7XG5cbiAgICAgICAgdGhpcy5wcm94eSAgICAgICAgICAgICAgID0gcHJveHk7XG4gICAgICAgIHRoaXMuYm9vdHN0cmFwcGVyICAgICAgICA9IG5ldyBCb290c3RyYXBwZXIoYnJvd3NlckNvbm5lY3Rpb25HYXRld2F5KTtcbiAgICAgICAgdGhpcy5wZW5kaW5nVGFza1Byb21pc2VzID0gW107XG5cbiAgICAgICAgdGhpcy5vcHRzID0ge1xuICAgICAgICAgICAgZXh0ZXJuYWxQcm94eUhvc3Q6ICAgICAgbnVsbCxcbiAgICAgICAgICAgIHByb3h5QnlwYXNzOiAgICAgICAgICAgIG51bGwsXG4gICAgICAgICAgICBzY3JlZW5zaG90UGF0aDogICAgICAgICBudWxsLFxuICAgICAgICAgICAgdGFrZVNjcmVlbnNob3RzT25GYWlsczogZmFsc2UsXG4gICAgICAgICAgICByZWNvcmRTY3JlZW5DYXB0dXJlOiAgICBmYWxzZSxcbiAgICAgICAgICAgIHNjcmVlbnNob3RQYXRoUGF0dGVybjogIG51bGwsXG4gICAgICAgICAgICBza2lwSnNFcnJvcnM6ICAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAgIHF1YXJhbnRpbmVNb2RlOiAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgZGVidWdNb2RlOiAgICAgICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgICByZXRyeVRlc3RQYWdlczogICAgICAgICBvcHRpb25zLnJldHJ5VGVzdFBhZ2VzLFxuICAgICAgICAgICAgc2VsZWN0b3JUaW1lb3V0OiAgICAgICAgREVGQVVMVF9TRUxFQ1RPUl9USU1FT1VULFxuICAgICAgICAgICAgcGFnZUxvYWRUaW1lb3V0OiAgICAgICAgREVGQVVMVF9QQUdFX0xPQURfVElNRU9VVFxuICAgICAgICB9O1xuICAgIH1cblxuXG4gICAgc3RhdGljIF9kaXNwb3NlQnJvd3NlclNldCAoYnJvd3NlclNldCkge1xuICAgICAgICByZXR1cm4gYnJvd3NlclNldC5kaXNwb3NlKCkuY2F0Y2goZSA9PiBERUJVR19MT0dHRVIoZSkpO1xuICAgIH1cblxuICAgIHN0YXRpYyBfZGlzcG9zZVJlcG9ydGVycyAocmVwb3J0ZXJzKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLmFsbChyZXBvcnRlcnMubWFwKHJlcG9ydGVyID0+IHJlcG9ydGVyLmRpc3Bvc2UoKS5jYXRjaChlID0+IERFQlVHX0xPR0dFUihlKSkpKTtcbiAgICB9XG5cbiAgICBzdGF0aWMgX2Rpc3Bvc2VUZXN0ZWRBcHAgKHRlc3RlZEFwcCkge1xuICAgICAgICByZXR1cm4gdGVzdGVkQXBwID8gdGVzdGVkQXBwLmtpbGwoKS5jYXRjaChlID0+IERFQlVHX0xPR0dFUihlKSkgOiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG5cbiAgICBzdGF0aWMgYXN5bmMgX2Rpc3Bvc2VUYXNrQW5kUmVsYXRlZEFzc2V0cyAodGFzaywgYnJvd3NlclNldCwgcmVwb3J0ZXJzLCB0ZXN0ZWRBcHApIHtcbiAgICAgICAgdGFzay5hYm9ydCgpO1xuICAgICAgICB0YXNrLmNsZWFyTGlzdGVuZXJzKCk7XG5cbiAgICAgICAgYXdhaXQgUnVubmVyLl9kaXNwb3NlQXNzZXRzKGJyb3dzZXJTZXQsIHJlcG9ydGVycywgdGVzdGVkQXBwKTtcbiAgICB9XG5cbiAgICBzdGF0aWMgX2Rpc3Bvc2VBc3NldHMgKGJyb3dzZXJTZXQsIHJlcG9ydGVycywgdGVzdGVkQXBwKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLmFsbChbXG4gICAgICAgICAgICBSdW5uZXIuX2Rpc3Bvc2VCcm93c2VyU2V0KGJyb3dzZXJTZXQpLFxuICAgICAgICAgICAgUnVubmVyLl9kaXNwb3NlUmVwb3J0ZXJzKHJlcG9ydGVycyksXG4gICAgICAgICAgICBSdW5uZXIuX2Rpc3Bvc2VUZXN0ZWRBcHAodGVzdGVkQXBwKVxuICAgICAgICBdKTtcbiAgICB9XG5cbiAgICBfY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UgKHRhc2tQcm9taXNlKSB7XG4gICAgICAgIGNvbnN0IHByb21pc2UgICAgICAgICAgID0gdGFza1Byb21pc2UudGhlbigoeyBjb21wbGV0aW9uUHJvbWlzZSB9KSA9PiBjb21wbGV0aW9uUHJvbWlzZSk7XG4gICAgICAgIGNvbnN0IHJlbW92ZUZyb21QZW5kaW5nID0gKCkgPT4gcmVtb3ZlKHRoaXMucGVuZGluZ1Rhc2tQcm9taXNlcywgcHJvbWlzZSk7XG5cbiAgICAgICAgcHJvbWlzZVxuICAgICAgICAgICAgLnRoZW4ocmVtb3ZlRnJvbVBlbmRpbmcpXG4gICAgICAgICAgICAuY2F0Y2gocmVtb3ZlRnJvbVBlbmRpbmcpO1xuXG4gICAgICAgIHByb21pc2UuY2FuY2VsID0gKCkgPT4gdGFza1Byb21pc2VcbiAgICAgICAgICAgIC50aGVuKCh7IGNhbmNlbFRhc2sgfSkgPT4gY2FuY2VsVGFzaygpKVxuICAgICAgICAgICAgLnRoZW4ocmVtb3ZlRnJvbVBlbmRpbmcpO1xuXG4gICAgICAgIHRoaXMucGVuZGluZ1Rhc2tQcm9taXNlcy5wdXNoKHByb21pc2UpO1xuICAgICAgICByZXR1cm4gcHJvbWlzZTtcbiAgICB9XG5cbiAgICAvLyBSdW4gdGFza1xuICAgIF9nZXRGYWlsZWRUZXN0Q291bnQgKHRhc2ssIHJlcG9ydGVyKSB7XG4gICAgICAgIGxldCBmYWlsZWRUZXN0Q291bnQgPSByZXBvcnRlci50ZXN0Q291bnQgLSByZXBvcnRlci5wYXNzZWQ7XG5cbiAgICAgICAgaWYgKHRhc2sub3B0cy5zdG9wT25GaXJzdEZhaWwgJiYgISFmYWlsZWRUZXN0Q291bnQpXG4gICAgICAgICAgICBmYWlsZWRUZXN0Q291bnQgPSAxO1xuXG4gICAgICAgIHJldHVybiBmYWlsZWRUZXN0Q291bnQ7XG4gICAgfVxuXG4gICAgYXN5bmMgX2dldFRhc2tSZXN1bHQgKHRhc2ssIGJyb3dzZXJTZXQsIHJlcG9ydGVycywgdGVzdGVkQXBwKSB7XG4gICAgICAgIHRhc2sub24oJ2Jyb3dzZXItam9iLWRvbmUnLCBqb2IgPT4gYnJvd3NlclNldC5yZWxlYXNlQ29ubmVjdGlvbihqb2IuYnJvd3NlckNvbm5lY3Rpb24pKTtcblxuICAgICAgICBjb25zdCBwcm9taXNlcyA9IFtcbiAgICAgICAgICAgIHRhc2sub25jZSgnZG9uZScpLFxuICAgICAgICAgICAgcHJvbWlzaWZ5RXZlbnQoYnJvd3NlclNldCwgJ2Vycm9yJylcbiAgICAgICAgXTtcblxuICAgICAgICBpZiAodGVzdGVkQXBwKVxuICAgICAgICAgICAgcHJvbWlzZXMucHVzaCh0ZXN0ZWRBcHAuZXJyb3JQcm9taXNlKTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgUHJvbWlzZS5yYWNlKHByb21pc2VzKTtcbiAgICAgICAgfVxuICAgICAgICBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBhd2FpdCBSdW5uZXIuX2Rpc3Bvc2VUYXNrQW5kUmVsYXRlZEFzc2V0cyh0YXNrLCBicm93c2VyU2V0LCByZXBvcnRlcnMsIHRlc3RlZEFwcCk7XG5cbiAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuXG4gICAgICAgIGF3YWl0IFJ1bm5lci5fZGlzcG9zZUFzc2V0cyhicm93c2VyU2V0LCByZXBvcnRlcnMsIHRlc3RlZEFwcCk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuX2dldEZhaWxlZFRlc3RDb3VudCh0YXNrLCByZXBvcnRlcnNbMF0pO1xuICAgIH1cblxuICAgIF9ydW5UYXNrIChyZXBvcnRlclBsdWdpbnMsIGJyb3dzZXJTZXQsIHRlc3RzLCB0ZXN0ZWRBcHApIHtcbiAgICAgICAgbGV0IGNvbXBsZXRlZCAgICAgICAgICAgPSBmYWxzZTtcbiAgICAgICAgY29uc3QgdGFzayAgICAgICAgICAgICAgPSBuZXcgVGFzayh0ZXN0cywgYnJvd3NlclNldC5icm93c2VyQ29ubmVjdGlvbkdyb3VwcywgdGhpcy5wcm94eSwgdGhpcy5vcHRzKTtcbiAgICAgICAgY29uc3QgcmVwb3J0ZXJzICAgICAgICAgPSByZXBvcnRlclBsdWdpbnMubWFwKHJlcG9ydGVyID0+IG5ldyBSZXBvcnRlcihyZXBvcnRlci5wbHVnaW4sIHRhc2ssIHJlcG9ydGVyLm91dFN0cmVhbSkpO1xuICAgICAgICBjb25zdCBjb21wbGV0aW9uUHJvbWlzZSA9IHRoaXMuX2dldFRhc2tSZXN1bHQodGFzaywgYnJvd3NlclNldCwgcmVwb3J0ZXJzLCB0ZXN0ZWRBcHApO1xuXG4gICAgICAgIHRhc2sub24oJ3N0YXJ0Jywgc3RhcnRIYW5kbGluZ1Rlc3RFcnJvcnMpO1xuXG4gICAgICAgIGlmICghdGhpcy5vcHRzLnNraXBVbmNhdWdodEVycm9ycykge1xuICAgICAgICAgICAgdGFzay5vbmNlKCd0ZXN0LXJ1bi1zdGFydCcsIGFkZFJ1bm5pbmdUZXN0KTtcbiAgICAgICAgICAgIHRhc2sub25jZSgndGVzdC1ydW4tZG9uZScsIHJlbW92ZVJ1bm5pbmdUZXN0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRhc2sub24oJ2RvbmUnLCBzdG9wSGFuZGxpbmdUZXN0RXJyb3JzKTtcblxuICAgICAgICBjb25zdCBzZXRDb21wbGV0ZWQgPSAoKSA9PiB7XG4gICAgICAgICAgICBjb21wbGV0ZWQgPSB0cnVlO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbXBsZXRpb25Qcm9taXNlXG4gICAgICAgICAgICAudGhlbihzZXRDb21wbGV0ZWQpXG4gICAgICAgICAgICAuY2F0Y2goc2V0Q29tcGxldGVkKTtcblxuICAgICAgICBjb25zdCBjYW5jZWxUYXNrID0gYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgaWYgKCFjb21wbGV0ZWQpXG4gICAgICAgICAgICAgICAgYXdhaXQgUnVubmVyLl9kaXNwb3NlVGFza0FuZFJlbGF0ZWRBc3NldHModGFzaywgYnJvd3NlclNldCwgcmVwb3J0ZXJzLCB0ZXN0ZWRBcHApO1xuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiB7IGNvbXBsZXRpb25Qcm9taXNlLCBjYW5jZWxUYXNrIH07XG4gICAgfVxuXG4gICAgX3JlZ2lzdGVyQXNzZXRzIChhc3NldHMpIHtcbiAgICAgICAgYXNzZXRzLmZvckVhY2goYXNzZXQgPT4gdGhpcy5wcm94eS5HRVQoYXNzZXQucGF0aCwgYXNzZXQuaW5mbykpO1xuICAgIH1cblxuICAgIF92YWxpZGF0ZVNwZWVkT3B0aW9uICgpIHtcbiAgICAgICAgY29uc3Qgc3BlZWQgPSB0aGlzLm9wdHMuc3BlZWQ7XG5cbiAgICAgICAgaWYgKHR5cGVvZiBzcGVlZCAhPT0gJ251bWJlcicgfHwgaXNOYU4oc3BlZWQpIHx8IHNwZWVkIDwgMC4wMSB8fCBzcGVlZCA+IDEpXG4gICAgICAgICAgICB0aHJvdyBuZXcgR2VuZXJhbEVycm9yKE1FU1NBR0UuaW52YWxpZFNwZWVkVmFsdWUpO1xuICAgIH1cblxuICAgIF92YWxpZGF0ZUNvbmN1cnJlbmN5T3B0aW9uICgpIHtcbiAgICAgICAgY29uc3QgY29uY3VycmVuY3kgPSB0aGlzLmJvb3RzdHJhcHBlci5jb25jdXJyZW5jeTtcblxuICAgICAgICBpZiAodHlwZW9mIGNvbmN1cnJlbmN5ICE9PSAnbnVtYmVyJyB8fCBpc05hTihjb25jdXJyZW5jeSkgfHwgY29uY3VycmVuY3kgPCAxKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEdlbmVyYWxFcnJvcihNRVNTQUdFLmludmFsaWRDb25jdXJyZW5jeUZhY3Rvcik7XG4gICAgfVxuXG4gICAgX3ZhbGlkYXRlUHJveHlCeXBhc3NPcHRpb24gKCkge1xuICAgICAgICBsZXQgcHJveHlCeXBhc3MgPSB0aGlzLm9wdHMucHJveHlCeXBhc3M7XG5cbiAgICAgICAgaWYgKCFwcm94eUJ5cGFzcylcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBhc3NlcnRUeXBlKFsgaXMuc3RyaW5nLCBpcy5hcnJheSBdLCBudWxsLCAnXCJwcm94eUJ5cGFzc1wiIGFyZ3VtZW50JywgcHJveHlCeXBhc3MpO1xuXG4gICAgICAgIGlmICh0eXBlb2YgcHJveHlCeXBhc3MgPT09ICdzdHJpbmcnKVxuICAgICAgICAgICAgcHJveHlCeXBhc3MgPSBbcHJveHlCeXBhc3NdO1xuXG4gICAgICAgIHByb3h5QnlwYXNzID0gcHJveHlCeXBhc3MucmVkdWNlKChhcnIsIHJ1bGVzKSA9PiB7XG4gICAgICAgICAgICBhc3NlcnRUeXBlKGlzLnN0cmluZywgbnVsbCwgJ1wicHJveHlCeXBhc3NcIiBhcmd1bWVudCcsIHJ1bGVzKTtcblxuICAgICAgICAgICAgcmV0dXJuIGFyci5jb25jYXQocnVsZXMuc3BsaXQoJywnKSk7XG4gICAgICAgIH0sIFtdKTtcblxuICAgICAgICB0aGlzLm9wdHMucHJveHlCeXBhc3MgPSBwcm94eUJ5cGFzcztcbiAgICB9XG5cbiAgICBfdmFsaWRhdGVTY3JlZW5zaG90T3B0aW9ucyAoKSB7XG4gICAgICAgIGNvbnN0IHNjcmVlbnNob3RQYXRoICAgICAgICA9IHRoaXMub3B0cy5zY3JlZW5zaG90UGF0aDtcbiAgICAgICAgY29uc3Qgc2NyZWVuc2hvdFBhdGhQYXR0ZXJuID0gdGhpcy5vcHRzLnNjcmVlbnNob3RQYXRoUGF0dGVybjtcblxuICAgICAgICBpZiAoc2NyZWVuc2hvdFBhdGgpIHtcbiAgICAgICAgICAgIHRoaXMuX3ZhbGlkYXRlU2NyZWVuc2hvdFBhdGgoc2NyZWVuc2hvdFBhdGgsICdzY3JlZW5zaG90cyBiYXNlIGRpcmVjdG9yeSBwYXRoJyk7XG5cbiAgICAgICAgICAgIHRoaXMub3B0cy5zY3JlZW5zaG90UGF0aCA9IHJlc29sdmVQYXRoKHNjcmVlbnNob3RQYXRoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzY3JlZW5zaG90UGF0aFBhdHRlcm4pXG4gICAgICAgICAgICB0aGlzLl92YWxpZGF0ZVNjcmVlbnNob3RQYXRoKHNjcmVlbnNob3RQYXRoUGF0dGVybiwgJ3NjcmVlbnNob3RzIHBhdGggcGF0dGVybicpO1xuXG4gICAgICAgIGlmICghc2NyZWVuc2hvdFBhdGggJiYgc2NyZWVuc2hvdFBhdGhQYXR0ZXJuKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEdlbmVyYWxFcnJvcihNRVNTQUdFLmNhbnRVc2VTY3JlZW5zaG90UGF0aFBhdHRlcm5XaXRob3V0QmFzZVNjcmVlbnNob3RQYXRoU3BlY2lmaWVkKTtcbiAgICB9XG5cbiAgICBfdmFsaWRhdGVSdW5PcHRpb25zICgpIHtcbiAgICAgICAgdGhpcy5fdmFsaWRhdGVTY3JlZW5zaG90T3B0aW9ucygpO1xuICAgICAgICB0aGlzLl92YWxpZGF0ZVNwZWVkT3B0aW9uKCk7XG4gICAgICAgIHRoaXMuX3ZhbGlkYXRlQ29uY3VycmVuY3lPcHRpb24oKTtcbiAgICAgICAgdGhpcy5fdmFsaWRhdGVQcm94eUJ5cGFzc09wdGlvbigpO1xuICAgIH1cblxuICAgIF92YWxpZGF0ZVNjcmVlbnNob3RQYXRoIChzY3JlZW5zaG90UGF0aCwgcGF0aFR5cGUpIHtcbiAgICAgICAgY29uc3QgZm9yYmlkZGVuQ2hhcnNMaXN0ID0gY2hlY2tGaWxlUGF0aChzY3JlZW5zaG90UGF0aCk7XG5cbiAgICAgICAgaWYgKGZvcmJpZGRlbkNoYXJzTGlzdC5sZW5ndGgpXG4gICAgICAgICAgICB0aHJvdyBuZXcgR2VuZXJhbEVycm9yKE1FU1NBR0UuZm9yYmlkZGVuQ2hhcmF0ZXJzSW5TY3JlZW5zaG90UGF0aCwgc2NyZWVuc2hvdFBhdGgsIHBhdGhUeXBlLCByZW5kZXJGb3JiaWRkZW5DaGFyc0xpc3QoZm9yYmlkZGVuQ2hhcnNMaXN0KSk7XG4gICAgfVxuXG4gICAgLy8gQVBJXG4gICAgZW1iZWRkaW5nT3B0aW9ucyAob3B0cykge1xuICAgICAgICB0aGlzLl9yZWdpc3RlckFzc2V0cyhvcHRzLmFzc2V0cyk7XG4gICAgICAgIHRoaXMub3B0cy5UZXN0UnVuQ3RvciA9IG9wdHMuVGVzdFJ1bkN0b3I7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgc3JjICguLi5zb3VyY2VzKSB7XG4gICAgICAgIHRoaXMuYm9vdHN0cmFwcGVyLnNvdXJjZXMgPSB0aGlzLmJvb3RzdHJhcHBlci5zb3VyY2VzLmNvbmNhdChmbGF0dGVuKHNvdXJjZXMpKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBicm93c2VycyAoLi4uYnJvd3NlcnMpIHtcbiAgICAgICAgdGhpcy5ib290c3RyYXBwZXIuYnJvd3NlcnMgPSB0aGlzLmJvb3RzdHJhcHBlci5icm93c2Vycy5jb25jYXQoZmxhdHRlbihicm93c2VycykpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIGNvbmN1cnJlbmN5IChjb25jdXJyZW5jeSkge1xuICAgICAgICB0aGlzLmJvb3RzdHJhcHBlci5jb25jdXJyZW5jeSA9IGNvbmN1cnJlbmN5O1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHJlcG9ydGVyIChuYW1lLCBvdXRTdHJlYW0pIHtcbiAgICAgICAgdGhpcy5ib290c3RyYXBwZXIucmVwb3J0ZXJzLnB1c2goe1xuICAgICAgICAgICAgbmFtZSxcbiAgICAgICAgICAgIG91dFN0cmVhbVxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBmaWx0ZXIgKGZpbHRlcikge1xuICAgICAgICB0aGlzLmJvb3RzdHJhcHBlci5maWx0ZXIgPSBmaWx0ZXI7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgdXNlUHJveHkgKGV4dGVybmFsUHJveHlIb3N0LCBwcm94eUJ5cGFzcykge1xuICAgICAgICB0aGlzLm9wdHMuZXh0ZXJuYWxQcm94eUhvc3QgPSBleHRlcm5hbFByb3h5SG9zdDtcbiAgICAgICAgdGhpcy5vcHRzLnByb3h5QnlwYXNzICAgICAgID0gcHJveHlCeXBhc3M7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgc2NyZWVuc2hvdHMgKHBhdGgsIHRha2VPbkZhaWxzID0gZmFsc2UsIHBhdHRlcm4gPSBudWxsLCByZWNvcmRTY3JlZW5DYXB0dXJlID0gZmFsc2UpIHtcbiAgICAgICAgdGhpcy5vcHRzLnRha2VTY3JlZW5zaG90c09uRmFpbHMgPSB0YWtlT25GYWlscztcbiAgICAgICAgdGhpcy5vcHRzLnNjcmVlbnNob3RQYXRoICAgICAgICAgPSBwYXRoO1xuICAgICAgICB0aGlzLm9wdHMuc2NyZWVuc2hvdFBhdGhQYXR0ZXJuICA9IHBhdHRlcm47XG4gICAgICAgIHRoaXMub3B0cy5yZWNvcmRTY3JlZW5DYXB0dXJlICAgID0gcmVjb3JkU2NyZWVuQ2FwdHVyZTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBzdGFydEFwcCAoY29tbWFuZCwgaW5pdERlbGF5KSB7XG4gICAgICAgIHRoaXMuYm9vdHN0cmFwcGVyLmFwcENvbW1hbmQgICA9IGNvbW1hbmQ7XG4gICAgICAgIHRoaXMuYm9vdHN0cmFwcGVyLmFwcEluaXREZWxheSA9IGluaXREZWxheTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBydW4gKHsgc2tpcEpzRXJyb3JzLCBkaXNhYmxlUGFnZVJlbG9hZHMsIHF1YXJhbnRpbmVNb2RlLCBkZWJ1Z01vZGUsIHNlbGVjdG9yVGltZW91dCwgYXNzZXJ0aW9uVGltZW91dCwgcGFnZUxvYWRUaW1lb3V0LCBzcGVlZCA9IDEsIGRlYnVnT25GYWlsLCBza2lwVW5jYXVnaHRFcnJvcnMsIHN0b3BPbkZpcnN0RmFpbCwgZGlzYWJsZVRlc3RTeW50YXhWYWxpZGF0aW9uIH0gPSB7fSkge1xuICAgICAgICB0aGlzLm9wdHMuc2tpcEpzRXJyb3JzICAgICAgID0gISFza2lwSnNFcnJvcnM7XG4gICAgICAgIHRoaXMub3B0cy5kaXNhYmxlUGFnZVJlbG9hZHMgPSAhIWRpc2FibGVQYWdlUmVsb2FkcztcbiAgICAgICAgdGhpcy5vcHRzLnF1YXJhbnRpbmVNb2RlICAgICA9ICEhcXVhcmFudGluZU1vZGU7XG4gICAgICAgIHRoaXMub3B0cy5kZWJ1Z01vZGUgICAgICAgICAgPSAhIWRlYnVnTW9kZTtcbiAgICAgICAgdGhpcy5vcHRzLmRlYnVnT25GYWlsICAgICAgICA9ICEhZGVidWdPbkZhaWw7XG4gICAgICAgIHRoaXMub3B0cy5zZWxlY3RvclRpbWVvdXQgICAgPSBzZWxlY3RvclRpbWVvdXQgPT09IHZvaWQgMCA/IERFRkFVTFRfU0VMRUNUT1JfVElNRU9VVCA6IHNlbGVjdG9yVGltZW91dDtcbiAgICAgICAgdGhpcy5vcHRzLmFzc2VydGlvblRpbWVvdXQgICA9IGFzc2VydGlvblRpbWVvdXQgPT09IHZvaWQgMCA/IERFRkFVTFRfQVNTRVJUSU9OX1RJTUVPVVQgOiBhc3NlcnRpb25UaW1lb3V0O1xuICAgICAgICB0aGlzLm9wdHMucGFnZUxvYWRUaW1lb3V0ICAgID0gcGFnZUxvYWRUaW1lb3V0ID09PSB2b2lkIDAgPyBERUZBVUxUX1BBR0VfTE9BRF9USU1FT1VUIDogcGFnZUxvYWRUaW1lb3V0O1xuICAgICAgICB0aGlzLm9wdHMuc3BlZWQgICAgICAgICAgICAgID0gc3BlZWQ7XG4gICAgICAgIHRoaXMub3B0cy5za2lwVW5jYXVnaHRFcnJvcnMgPSAhIXNraXBVbmNhdWdodEVycm9ycztcbiAgICAgICAgdGhpcy5vcHRzLnN0b3BPbkZpcnN0RmFpbCAgICA9ICEhc3RvcE9uRmlyc3RGYWlsO1xuXG4gICAgICAgIHRoaXMuYm9vdHN0cmFwcGVyLmRpc2FibGVUZXN0U3ludGF4VmFsaWRhdGlvbiA9IGRpc2FibGVUZXN0U3ludGF4VmFsaWRhdGlvbjtcblxuICAgICAgICBjb25zdCBydW5UYXNrUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5fdmFsaWRhdGVSdW5PcHRpb25zKCk7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5ib290c3RyYXBwZXIuY3JlYXRlUnVubmFibGVDb25maWd1cmF0aW9uKCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnRoZW4oKHsgcmVwb3J0ZXJQbHVnaW5zLCBicm93c2VyU2V0LCB0ZXN0cywgdGVzdGVkQXBwIH0pID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLmVtaXQoJ2RvbmUtYm9vdHN0cmFwcGluZycpO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3J1blRhc2socmVwb3J0ZXJQbHVnaW5zLCBicm93c2VyU2V0LCB0ZXN0cywgdGVzdGVkQXBwKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiB0aGlzLl9jcmVhdGVDYW5jZWxhYmxlUHJvbWlzZShydW5UYXNrUHJvbWlzZSk7XG4gICAgfVxuXG4gICAgYXN5bmMgc3RvcCAoKSB7XG4gICAgICAgIC8vIE5PVEU6IFdoZW4gdGFza1Byb21pc2UgaXMgY2FuY2VsbGVkLCBpdCBpcyByZW1vdmVkIGZyb21cbiAgICAgICAgLy8gdGhlIHBlbmRpbmdUYXNrUHJvbWlzZXMgYXJyYXksIHdoaWNoIGxlYWRzIHRvIHNoaWZ0aW5nIGluZGV4ZXNcbiAgICAgICAgLy8gdG93YXJkcyB0aGUgYmVnaW5uaW5nLiBTbywgd2UgbXVzdCBjb3B5IHRoZSBhcnJheSBpbiBvcmRlciB0byBpdGVyYXRlIGl0LFxuICAgICAgICAvLyBvciB3ZSBjYW4gcGVyZm9ybSBpdGVyYXRpb24gZnJvbSB0aGUgZW5kIHRvIHRoZSBiZWdpbm5pbmcuXG4gICAgICAgIGNvbnN0IGNhbmNlbGxhdGlvblByb21pc2VzID0gbWFwUmV2ZXJzZSh0aGlzLnBlbmRpbmdUYXNrUHJvbWlzZXMsIHRhc2tQcm9taXNlID0+IHRhc2tQcm9taXNlLmNhbmNlbCgpKTtcblxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChjYW5jZWxsYXRpb25Qcm9taXNlcyk7XG4gICAgfVxufVxuIl19
