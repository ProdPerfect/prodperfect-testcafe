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
            task.removeAllListeners();

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

            const promises = [(0, _promisifyEvent2.default)(task, 'done'), (0, _promisifyEvent2.default)(browserSet, 'error')];

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

        task.once('start', _handleErrors.startHandlingTestErrors);

        if (!this.opts.skipUncaughtErrors) {
            task.on('test-run-start', _handleErrors.addRunningTest);
            task.on('test-run-done', _handleErrors.removeRunningTest);
        }

        task.once('done', _handleErrors.stopHandlingTestErrors);

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

    _validateRunOptions() {
        const concurrency = this.bootstrapper.concurrency;
        const speed = this.opts.speed;
        const screenshotPath = this.opts.screenshotPath;
        const screenshotPathPattern = this.opts.screenshotPathPattern;
        let proxyBypass = this.opts.proxyBypass;

        if (screenshotPath) {
            this._validateScreenshotPath(screenshotPath, 'screenshots base directory path');

            this.opts.screenshotPath = (0, _path.resolve)(screenshotPath);
        }

        if (screenshotPathPattern) this._validateScreenshotPath(screenshotPathPattern, 'screenshots path pattern');

        if (typeof speed !== 'number' || isNaN(speed) || speed < 0.01 || speed > 1) throw new _runtime.GeneralError(_message2.default.invalidSpeedValue);

        if (typeof concurrency !== 'number' || isNaN(concurrency) || concurrency < 1) throw new _runtime.GeneralError(_message2.default.invalidConcurrencyFactor);

        if (proxyBypass) {
            (0, _typeAssertions.assertType)([_typeAssertions.is.string, _typeAssertions.is.array], null, '"proxyBypass" argument', proxyBypass);

            if (typeof proxyBypass === 'string') proxyBypass = [proxyBypass];

            proxyBypass = proxyBypass.reduce((arr, rules) => {
                (0, _typeAssertions.assertType)(_typeAssertions.is.string, null, '"proxyBypass" argument', rules);

                return arr.concat(rules.split(','));
            }, []);

            this.opts.proxyBypass = proxyBypass;
        }
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
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9ydW5uZXIvaW5kZXguanMiXSwibmFtZXMiOlsiREVGQVVMVF9TRUxFQ1RPUl9USU1FT1VUIiwiREVGQVVMVF9BU1NFUlRJT05fVElNRU9VVCIsIkRFRkFVTFRfUEFHRV9MT0FEX1RJTUVPVVQiLCJERUJVR19MT0dHRVIiLCJSdW5uZXIiLCJFdmVudEVtaXR0ZXIiLCJjb25zdHJ1Y3RvciIsInByb3h5IiwiYnJvd3NlckNvbm5lY3Rpb25HYXRld2F5Iiwib3B0aW9ucyIsImJvb3RzdHJhcHBlciIsIkJvb3RzdHJhcHBlciIsInBlbmRpbmdUYXNrUHJvbWlzZXMiLCJvcHRzIiwiZXh0ZXJuYWxQcm94eUhvc3QiLCJwcm94eUJ5cGFzcyIsInNjcmVlbnNob3RQYXRoIiwidGFrZVNjcmVlbnNob3RzT25GYWlscyIsInJlY29yZFNjcmVlbkNhcHR1cmUiLCJzY3JlZW5zaG90UGF0aFBhdHRlcm4iLCJza2lwSnNFcnJvcnMiLCJxdWFyYW50aW5lTW9kZSIsImRlYnVnTW9kZSIsInJldHJ5VGVzdFBhZ2VzIiwic2VsZWN0b3JUaW1lb3V0IiwicGFnZUxvYWRUaW1lb3V0IiwiX2Rpc3Bvc2VCcm93c2VyU2V0IiwiYnJvd3NlclNldCIsImRpc3Bvc2UiLCJjYXRjaCIsImUiLCJfZGlzcG9zZVJlcG9ydGVycyIsInJlcG9ydGVycyIsIlByb21pc2UiLCJhbGwiLCJtYXAiLCJyZXBvcnRlciIsIl9kaXNwb3NlVGVzdGVkQXBwIiwidGVzdGVkQXBwIiwia2lsbCIsInJlc29sdmUiLCJfZGlzcG9zZVRhc2tBbmRSZWxhdGVkQXNzZXRzIiwidGFzayIsImFib3J0IiwicmVtb3ZlQWxsTGlzdGVuZXJzIiwiX2Rpc3Bvc2VBc3NldHMiLCJfY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UiLCJ0YXNrUHJvbWlzZSIsInByb21pc2UiLCJ0aGVuIiwiY29tcGxldGlvblByb21pc2UiLCJyZW1vdmVGcm9tUGVuZGluZyIsImNhbmNlbCIsImNhbmNlbFRhc2siLCJwdXNoIiwiX2dldEZhaWxlZFRlc3RDb3VudCIsImZhaWxlZFRlc3RDb3VudCIsInRlc3RDb3VudCIsInBhc3NlZCIsInN0b3BPbkZpcnN0RmFpbCIsIl9nZXRUYXNrUmVzdWx0Iiwib24iLCJyZWxlYXNlQ29ubmVjdGlvbiIsImpvYiIsImJyb3dzZXJDb25uZWN0aW9uIiwicHJvbWlzZXMiLCJlcnJvclByb21pc2UiLCJyYWNlIiwiZXJyIiwiX3J1blRhc2siLCJyZXBvcnRlclBsdWdpbnMiLCJ0ZXN0cyIsImNvbXBsZXRlZCIsIlRhc2siLCJicm93c2VyQ29ubmVjdGlvbkdyb3VwcyIsIlJlcG9ydGVyIiwicGx1Z2luIiwib3V0U3RyZWFtIiwib25jZSIsInN0YXJ0SGFuZGxpbmdUZXN0RXJyb3JzIiwic2tpcFVuY2F1Z2h0RXJyb3JzIiwiYWRkUnVubmluZ1Rlc3QiLCJyZW1vdmVSdW5uaW5nVGVzdCIsInN0b3BIYW5kbGluZ1Rlc3RFcnJvcnMiLCJzZXRDb21wbGV0ZWQiLCJfcmVnaXN0ZXJBc3NldHMiLCJhc3NldHMiLCJmb3JFYWNoIiwiYXNzZXQiLCJHRVQiLCJwYXRoIiwiaW5mbyIsIl92YWxpZGF0ZVJ1bk9wdGlvbnMiLCJjb25jdXJyZW5jeSIsInNwZWVkIiwiX3ZhbGlkYXRlU2NyZWVuc2hvdFBhdGgiLCJpc05hTiIsIkdlbmVyYWxFcnJvciIsIk1FU1NBR0UiLCJpbnZhbGlkU3BlZWRWYWx1ZSIsImludmFsaWRDb25jdXJyZW5jeUZhY3RvciIsImlzIiwic3RyaW5nIiwiYXJyYXkiLCJyZWR1Y2UiLCJhcnIiLCJydWxlcyIsImNvbmNhdCIsInNwbGl0IiwicGF0aFR5cGUiLCJmb3JiaWRkZW5DaGFyc0xpc3QiLCJsZW5ndGgiLCJmb3JiaWRkZW5DaGFyYXRlcnNJblNjcmVlbnNob3RQYXRoIiwiZW1iZWRkaW5nT3B0aW9ucyIsIlRlc3RSdW5DdG9yIiwic3JjIiwic291cmNlcyIsImJyb3dzZXJzIiwibmFtZSIsImZpbHRlciIsInVzZVByb3h5Iiwic2NyZWVuc2hvdHMiLCJ0YWtlT25GYWlscyIsInBhdHRlcm4iLCJzdGFydEFwcCIsImNvbW1hbmQiLCJpbml0RGVsYXkiLCJhcHBDb21tYW5kIiwiYXBwSW5pdERlbGF5IiwicnVuIiwiZGlzYWJsZVBhZ2VSZWxvYWRzIiwiYXNzZXJ0aW9uVGltZW91dCIsImRlYnVnT25GYWlsIiwiZGlzYWJsZVRlc3RTeW50YXhWYWxpZGF0aW9uIiwicnVuVGFza1Byb21pc2UiLCJjcmVhdGVSdW5uYWJsZUNvbmZpZ3VyYXRpb24iLCJlbWl0Iiwic3RvcCIsImNhbmNlbGxhdGlvblByb21pc2VzIl0sIm1hcHBpbmdzIjoiOzs7Ozs7OztBQUFBOztBQUNBOzs7O0FBQ0E7Ozs7QUFDQTs7OztBQUNBOzs7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7QUFDQTs7OztBQUNBOzs7O0FBQ0E7O0FBQ0E7Ozs7QUFDQTs7QUFDQTs7OztBQUNBOzs7O0FBQ0E7Ozs7QUFHQSxNQUFNQSwyQkFBNEIsS0FBbEM7QUFDQSxNQUFNQyw0QkFBNEIsSUFBbEM7QUFDQSxNQUFNQyw0QkFBNEIsSUFBbEM7O0FBRUEsTUFBTUMsZUFBZSxxQkFBTSxpQkFBTixDQUFyQjs7QUFFZSxNQUFNQyxNQUFOLFNBQXFCQyxvQkFBckIsQ0FBa0M7QUFDN0NDLGdCQUFhQyxLQUFiLEVBQW9CQyx3QkFBcEIsRUFBOENDLFVBQVUsRUFBeEQsRUFBNEQ7QUFDeEQ7O0FBRUEsYUFBS0YsS0FBTCxHQUEyQkEsS0FBM0I7QUFDQSxhQUFLRyxZQUFMLEdBQTJCLElBQUlDLHNCQUFKLENBQWlCSCx3QkFBakIsQ0FBM0I7QUFDQSxhQUFLSSxtQkFBTCxHQUEyQixFQUEzQjs7QUFFQSxhQUFLQyxJQUFMLEdBQVk7QUFDUkMsK0JBQXdCLElBRGhCO0FBRVJDLHlCQUF3QixJQUZoQjtBQUdSQyw0QkFBd0IsSUFIaEI7QUFJUkMsb0NBQXdCLEtBSmhCO0FBS1JDLGlDQUF3QixLQUxoQjtBQU1SQyxtQ0FBd0IsSUFOaEI7QUFPUkMsMEJBQXdCLEtBUGhCO0FBUVJDLDRCQUF3QixLQVJoQjtBQVNSQyx1QkFBd0IsS0FUaEI7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RUFBMkM0QyxLQUEzQyxFQUFrRGpDLFNBQWxELENBQVA7QUFDSCxTQVZrQixDQUF2Qjs7QUFZQSxlQUFPLEtBQUtRLHdCQUFMLENBQThCd0YsY0FBOUIsQ0FBUDtBQUNIOztBQUVLRyxRQUFOLEdBQWM7QUFBQTs7QUFBQTtBQUNWO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esa0JBQU1DLHVCQUF1QiwwQkFBVyxPQUFLOUgsbUJBQWhCLEVBQXFDO0FBQUEsdUJBQWVtQyxZQUFZSyxNQUFaLEVBQWY7QUFBQSxhQUFyQyxDQUE3Qjs7QUFFQSxrQkFBTW5CLGlCQUFRQyxHQUFSLENBQVl3RyxvQkFBWixDQUFOO0FBUFU7QUFRYjtBQTdSNEM7a0JBQTVCdEksTSIsImZpbGUiOiJydW5uZXIvaW5kZXguanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyByZXNvbHZlIGFzIHJlc29sdmVQYXRoIH0gZnJvbSAncGF0aCc7XG5pbXBvcnQgZGVidWcgZnJvbSAnZGVidWcnO1xuaW1wb3J0IFByb21pc2UgZnJvbSAncGlua2llJztcbmltcG9ydCBwcm9taXNpZnlFdmVudCBmcm9tICdwcm9taXNpZnktZXZlbnQnO1xuaW1wb3J0IG1hcFJldmVyc2UgZnJvbSAnbWFwLXJldmVyc2UnO1xuaW1wb3J0IHsgRXZlbnRFbWl0dGVyIH0gZnJvbSAnZXZlbnRzJztcbmltcG9ydCB7IGZsYXR0ZW5EZWVwIGFzIGZsYXR0ZW4sIHB1bGwgYXMgcmVtb3ZlIH0gZnJvbSAnbG9kYXNoJztcbmltcG9ydCBCb290c3RyYXBwZXIgZnJvbSAnLi9ib290c3RyYXBwZXInO1xuaW1wb3J0IFJlcG9ydGVyIGZyb20gJy4uL3JlcG9ydGVyJztcbmltcG9ydCBUYXNrIGZyb20gJy4vdGFzayc7XG5pbXBvcnQgeyBHZW5lcmFsRXJyb3IgfSBmcm9tICcuLi9lcnJvcnMvcnVudGltZSc7XG5pbXBvcnQgTUVTU0FHRSBmcm9tICcuLi9lcnJvcnMvcnVudGltZS9tZXNzYWdlJztcbmltcG9ydCB7IGFzc2VydFR5cGUsIGlzIH0gZnJvbSAnLi4vZXJyb3JzL3J1bnRpbWUvdHlwZS1hc3NlcnRpb25zJztcbmltcG9ydCByZW5kZXJGb3JiaWRkZW5DaGFyc0xpc3QgZnJvbSAnLi4vZXJyb3JzL3JlbmRlci1mb3JiaWRkZW4tY2hhcnMtbGlzdCc7XG5pbXBvcnQgY2hlY2tGaWxlUGF0aCBmcm9tICcuLi91dGlscy9jaGVjay1maWxlLXBhdGgnO1xuaW1wb3J0IHsgYWRkUnVubmluZ1Rlc3QsIHJlbW92ZVJ1bm5pbmdUZXN0LCBzdGFydEhhbmRsaW5nVGVzdEVycm9ycywgc3RvcEhhbmRsaW5nVGVzdEVycm9ycyB9IGZyb20gJy4uL3V0aWxzL2hhbmRsZS1lcnJvcnMnO1xuXG5cbmNvbnN0IERFRkFVTFRfU0VMRUNUT1JfVElNRU9VVCAgPSAxMDAwMDtcbmNvbnN0IERFRkFVTFRfQVNTRVJUSU9OX1RJTUVPVVQgPSAzMDAwO1xuY29uc3QgREVGQVVMVF9QQUdFX0xPQURfVElNRU9VVCA9IDMwMDA7XG5cbmNvbnN0IERFQlVHX0xPR0dFUiA9IGRlYnVnKCd0ZXN0Y2FmZTpydW5uZXInKTtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgUnVubmVyIGV4dGVuZHMgRXZlbnRFbWl0dGVyIHtcbiAgICBjb25zdHJ1Y3RvciAocHJveHksIGJyb3dzZXJDb25uZWN0aW9uR2F0ZXdheSwgb3B0aW9ucyA9IHt9KSB7XG4gICAgICAgIHN1cGVyKCk7XG5cbiAgICAgICAgdGhpcy5wcm94eSAgICAgICAgICAgICAgID0gcHJveHk7XG4gICAgICAgIHRoaXMuYm9vdHN0cmFwcGVyICAgICAgICA9IG5ldyBCb290c3RyYXBwZXIoYnJvd3NlckNvbm5lY3Rpb25HYXRld2F5KTtcbiAgICAgICAgdGhpcy5wZW5kaW5nVGFza1Byb21pc2VzID0gW107XG5cbiAgICAgICAgdGhpcy5vcHRzID0ge1xuICAgICAgICAgICAgZXh0ZXJuYWxQcm94eUhvc3Q6ICAgICAgbnVsbCxcbiAgICAgICAgICAgIHByb3h5QnlwYXNzOiAgICAgICAgICAgIG51bGwsXG4gICAgICAgICAgICBzY3JlZW5zaG90UGF0aDogICAgICAgICBudWxsLFxuICAgICAgICAgICAgdGFrZVNjcmVlbnNob3RzT25GYWlsczogZmFsc2UsXG4gICAgICAgICAgICByZWNvcmRTY3JlZW5DYXB0dXJlOiAgICBmYWxzZSxcbiAgICAgICAgICAgIHNjcmVlbnNob3RQYXRoUGF0dGVybjogIG51bGwsXG4gICAgICAgICAgICBza2lwSnNFcnJvcnM6ICAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAgIHF1YXJhbnRpbmVNb2RlOiAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgZGVidWdNb2RlOiAgICAgICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgICByZXRyeVRlc3RQYWdlczogICAgICAgICBvcHRpb25zLnJldHJ5VGVzdFBhZ2VzLFxuICAgICAgICAgICAgc2VsZWN0b3JUaW1lb3V0OiAgICAgICAgREVGQVVMVF9TRUxFQ1RPUl9USU1FT1VULFxuICAgICAgICAgICAgcGFnZUxvYWRUaW1lb3V0OiAgICAgICAgREVGQVVMVF9QQUdFX0xPQURfVElNRU9VVFxuICAgICAgICB9O1xuICAgIH1cblxuXG4gICAgc3RhdGljIF9kaXNwb3NlQnJvd3NlclNldCAoYnJvd3NlclNldCkge1xuICAgICAgICByZXR1cm4gYnJvd3NlclNldC5kaXNwb3NlKCkuY2F0Y2goZSA9PiBERUJVR19MT0dHRVIoZSkpO1xuICAgIH1cblxuICAgIHN0YXRpYyBfZGlzcG9zZVJlcG9ydGVycyAocmVwb3J0ZXJzKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLmFsbChyZXBvcnRlcnMubWFwKHJlcG9ydGVyID0+IHJlcG9ydGVyLmRpc3Bvc2UoKS5jYXRjaChlID0+IERFQlVHX0xPR0dFUihlKSkpKTtcbiAgICB9XG5cbiAgICBzdGF0aWMgX2Rpc3Bvc2VUZXN0ZWRBcHAgKHRlc3RlZEFwcCkge1xuICAgICAgICByZXR1cm4gdGVzdGVkQXBwID8gdGVzdGVkQXBwLmtpbGwoKS5jYXRjaChlID0+IERFQlVHX0xPR0dFUihlKSkgOiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG5cbiAgICBzdGF0aWMgYXN5bmMgX2Rpc3Bvc2VUYXNrQW5kUmVsYXRlZEFzc2V0cyAodGFzaywgYnJvd3NlclNldCwgcmVwb3J0ZXJzLCB0ZXN0ZWRBcHApIHtcbiAgICAgICAgdGFzay5hYm9ydCgpO1xuICAgICAgICB0YXNrLnJlbW92ZUFsbExpc3RlbmVycygpO1xuXG4gICAgICAgIGF3YWl0IFJ1bm5lci5fZGlzcG9zZUFzc2V0cyhicm93c2VyU2V0LCByZXBvcnRlcnMsIHRlc3RlZEFwcCk7XG4gICAgfVxuXG4gICAgc3RhdGljIF9kaXNwb3NlQXNzZXRzIChicm93c2VyU2V0LCByZXBvcnRlcnMsIHRlc3RlZEFwcCkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwoW1xuICAgICAgICAgICAgUnVubmVyLl9kaXNwb3NlQnJvd3NlclNldChicm93c2VyU2V0KSxcbiAgICAgICAgICAgIFJ1bm5lci5fZGlzcG9zZVJlcG9ydGVycyhyZXBvcnRlcnMpLFxuICAgICAgICAgICAgUnVubmVyLl9kaXNwb3NlVGVzdGVkQXBwKHRlc3RlZEFwcClcbiAgICAgICAgXSk7XG4gICAgfVxuXG4gICAgX2NyZWF0ZUNhbmNlbGFibGVQcm9taXNlICh0YXNrUHJvbWlzZSkge1xuICAgICAgICBjb25zdCBwcm9taXNlICAgICAgICAgICA9IHRhc2tQcm9taXNlLnRoZW4oKHsgY29tcGxldGlvblByb21pc2UgfSkgPT4gY29tcGxldGlvblByb21pc2UpO1xuICAgICAgICBjb25zdCByZW1vdmVGcm9tUGVuZGluZyA9ICgpID0+IHJlbW92ZSh0aGlzLnBlbmRpbmdUYXNrUHJvbWlzZXMsIHByb21pc2UpO1xuXG4gICAgICAgIHByb21pc2VcbiAgICAgICAgICAgIC50aGVuKHJlbW92ZUZyb21QZW5kaW5nKVxuICAgICAgICAgICAgLmNhdGNoKHJlbW92ZUZyb21QZW5kaW5nKTtcblxuICAgICAgICBwcm9taXNlLmNhbmNlbCA9ICgpID0+IHRhc2tQcm9taXNlXG4gICAgICAgICAgICAudGhlbigoeyBjYW5jZWxUYXNrIH0pID0+IGNhbmNlbFRhc2soKSlcbiAgICAgICAgICAgIC50aGVuKHJlbW92ZUZyb21QZW5kaW5nKTtcblxuICAgICAgICB0aGlzLnBlbmRpbmdUYXNrUHJvbWlzZXMucHVzaChwcm9taXNlKTtcbiAgICAgICAgcmV0dXJuIHByb21pc2U7XG4gICAgfVxuXG4gICAgLy8gUnVuIHRhc2tcbiAgICBfZ2V0RmFpbGVkVGVzdENvdW50ICh0YXNrLCByZXBvcnRlcikge1xuICAgICAgICBsZXQgZmFpbGVkVGVzdENvdW50ID0gcmVwb3J0ZXIudGVzdENvdW50IC0gcmVwb3J0ZXIucGFzc2VkO1xuXG4gICAgICAgIGlmICh0YXNrLm9wdHMuc3RvcE9uRmlyc3RGYWlsICYmICEhZmFpbGVkVGVzdENvdW50KVxuICAgICAgICAgICAgZmFpbGVkVGVzdENvdW50ID0gMTtcblxuICAgICAgICByZXR1cm4gZmFpbGVkVGVzdENvdW50O1xuICAgIH1cblxuICAgIGFzeW5jIF9nZXRUYXNrUmVzdWx0ICh0YXNrLCBicm93c2VyU2V0LCByZXBvcnRlcnMsIHRlc3RlZEFwcCkge1xuICAgICAgICB0YXNrLm9uKCdicm93c2VyLWpvYi1kb25lJywgam9iID0+IGJyb3dzZXJTZXQucmVsZWFzZUNvbm5lY3Rpb24oam9iLmJyb3dzZXJDb25uZWN0aW9uKSk7XG5cbiAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBbXG4gICAgICAgICAgICBwcm9taXNpZnlFdmVudCh0YXNrLCAnZG9uZScpLFxuICAgICAgICAgICAgcHJvbWlzaWZ5RXZlbnQoYnJvd3NlclNldCwgJ2Vycm9yJylcbiAgICAgICAgXTtcblxuICAgICAgICBpZiAodGVzdGVkQXBwKVxuICAgICAgICAgICAgcHJvbWlzZXMucHVzaCh0ZXN0ZWRBcHAuZXJyb3JQcm9taXNlKTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgUHJvbWlzZS5yYWNlKHByb21pc2VzKTtcbiAgICAgICAgfVxuICAgICAgICBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBhd2FpdCBSdW5uZXIuX2Rpc3Bvc2VUYXNrQW5kUmVsYXRlZEFzc2V0cyh0YXNrLCBicm93c2VyU2V0LCByZXBvcnRlcnMsIHRlc3RlZEFwcCk7XG5cbiAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuXG4gICAgICAgIGF3YWl0IFJ1bm5lci5fZGlzcG9zZUFzc2V0cyhicm93c2VyU2V0LCByZXBvcnRlcnMsIHRlc3RlZEFwcCk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuX2dldEZhaWxlZFRlc3RDb3VudCh0YXNrLCByZXBvcnRlcnNbMF0pO1xuICAgIH1cblxuICAgIF9ydW5UYXNrIChyZXBvcnRlclBsdWdpbnMsIGJyb3dzZXJTZXQsIHRlc3RzLCB0ZXN0ZWRBcHApIHtcbiAgICAgICAgbGV0IGNvbXBsZXRlZCAgICAgICAgICAgPSBmYWxzZTtcbiAgICAgICAgY29uc3QgdGFzayAgICAgICAgICAgICAgPSBuZXcgVGFzayh0ZXN0cywgYnJvd3NlclNldC5icm93c2VyQ29ubmVjdGlvbkdyb3VwcywgdGhpcy5wcm94eSwgdGhpcy5vcHRzKTtcbiAgICAgICAgY29uc3QgcmVwb3J0ZXJzICAgICAgICAgPSByZXBvcnRlclBsdWdpbnMubWFwKHJlcG9ydGVyID0+IG5ldyBSZXBvcnRlcihyZXBvcnRlci5wbHVnaW4sIHRhc2ssIHJlcG9ydGVyLm91dFN0cmVhbSkpO1xuICAgICAgICBjb25zdCBjb21wbGV0aW9uUHJvbWlzZSA9IHRoaXMuX2dldFRhc2tSZXN1bHQodGFzaywgYnJvd3NlclNldCwgcmVwb3J0ZXJzLCB0ZXN0ZWRBcHApO1xuXG4gICAgICAgIHRhc2sub25jZSgnc3RhcnQnLCBzdGFydEhhbmRsaW5nVGVzdEVycm9ycyk7XG5cbiAgICAgICAgaWYgKCF0aGlzLm9wdHMuc2tpcFVuY2F1Z2h0RXJyb3JzKSB7XG4gICAgICAgICAgICB0YXNrLm9uKCd0ZXN0LXJ1bi1zdGFydCcsIGFkZFJ1bm5pbmdUZXN0KTtcbiAgICAgICAgICAgIHRhc2sub24oJ3Rlc3QtcnVuLWRvbmUnLCByZW1vdmVSdW5uaW5nVGVzdCk7XG4gICAgICAgIH1cblxuICAgICAgICB0YXNrLm9uY2UoJ2RvbmUnLCBzdG9wSGFuZGxpbmdUZXN0RXJyb3JzKTtcblxuICAgICAgICBjb25zdCBzZXRDb21wbGV0ZWQgPSAoKSA9PiB7XG4gICAgICAgICAgICBjb21wbGV0ZWQgPSB0cnVlO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbXBsZXRpb25Qcm9taXNlXG4gICAgICAgICAgICAudGhlbihzZXRDb21wbGV0ZWQpXG4gICAgICAgICAgICAuY2F0Y2goc2V0Q29tcGxldGVkKTtcblxuICAgICAgICBjb25zdCBjYW5jZWxUYXNrID0gYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgaWYgKCFjb21wbGV0ZWQpXG4gICAgICAgICAgICAgICAgYXdhaXQgUnVubmVyLl9kaXNwb3NlVGFza0FuZFJlbGF0ZWRBc3NldHModGFzaywgYnJvd3NlclNldCwgcmVwb3J0ZXJzLCB0ZXN0ZWRBcHApO1xuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiB7IGNvbXBsZXRpb25Qcm9taXNlLCBjYW5jZWxUYXNrIH07XG4gICAgfVxuXG4gICAgX3JlZ2lzdGVyQXNzZXRzIChhc3NldHMpIHtcbiAgICAgICAgYXNzZXRzLmZvckVhY2goYXNzZXQgPT4gdGhpcy5wcm94eS5HRVQoYXNzZXQucGF0aCwgYXNzZXQuaW5mbykpO1xuICAgIH1cblxuICAgIF92YWxpZGF0ZVJ1bk9wdGlvbnMgKCkge1xuICAgICAgICBjb25zdCBjb25jdXJyZW5jeSAgICAgICAgICAgPSB0aGlzLmJvb3RzdHJhcHBlci5jb25jdXJyZW5jeTtcbiAgICAgICAgY29uc3Qgc3BlZWQgICAgICAgICAgICAgICAgID0gdGhpcy5vcHRzLnNwZWVkO1xuICAgICAgICBjb25zdCBzY3JlZW5zaG90UGF0aCAgICAgICAgPSB0aGlzLm9wdHMuc2NyZWVuc2hvdFBhdGg7XG4gICAgICAgIGNvbnN0IHNjcmVlbnNob3RQYXRoUGF0dGVybiA9IHRoaXMub3B0cy5zY3JlZW5zaG90UGF0aFBhdHRlcm47XG4gICAgICAgIGxldCBwcm94eUJ5cGFzcyAgICAgICAgICAgICA9IHRoaXMub3B0cy5wcm94eUJ5cGFzcztcblxuICAgICAgICBpZiAoc2NyZWVuc2hvdFBhdGgpIHtcbiAgICAgICAgICAgIHRoaXMuX3ZhbGlkYXRlU2NyZWVuc2hvdFBhdGgoc2NyZWVuc2hvdFBhdGgsICdzY3JlZW5zaG90cyBiYXNlIGRpcmVjdG9yeSBwYXRoJyk7XG5cbiAgICAgICAgICAgIHRoaXMub3B0cy5zY3JlZW5zaG90UGF0aCA9IHJlc29sdmVQYXRoKHNjcmVlbnNob3RQYXRoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzY3JlZW5zaG90UGF0aFBhdHRlcm4pXG4gICAgICAgICAgICB0aGlzLl92YWxpZGF0ZVNjcmVlbnNob3RQYXRoKHNjcmVlbnNob3RQYXRoUGF0dGVybiwgJ3NjcmVlbnNob3RzIHBhdGggcGF0dGVybicpO1xuXG4gICAgICAgIGlmICh0eXBlb2Ygc3BlZWQgIT09ICdudW1iZXInIHx8IGlzTmFOKHNwZWVkKSB8fCBzcGVlZCA8IDAuMDEgfHwgc3BlZWQgPiAxKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEdlbmVyYWxFcnJvcihNRVNTQUdFLmludmFsaWRTcGVlZFZhbHVlKTtcblxuICAgICAgICBpZiAodHlwZW9mIGNvbmN1cnJlbmN5ICE9PSAnbnVtYmVyJyB8fCBpc05hTihjb25jdXJyZW5jeSkgfHwgY29uY3VycmVuY3kgPCAxKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEdlbmVyYWxFcnJvcihNRVNTQUdFLmludmFsaWRDb25jdXJyZW5jeUZhY3Rvcik7XG5cbiAgICAgICAgaWYgKHByb3h5QnlwYXNzKSB7XG4gICAgICAgICAgICBhc3NlcnRUeXBlKFsgaXMuc3RyaW5nLCBpcy5hcnJheSBdLCBudWxsLCAnXCJwcm94eUJ5cGFzc1wiIGFyZ3VtZW50JywgcHJveHlCeXBhc3MpO1xuXG4gICAgICAgICAgICBpZiAodHlwZW9mIHByb3h5QnlwYXNzID09PSAnc3RyaW5nJylcbiAgICAgICAgICAgICAgICBwcm94eUJ5cGFzcyA9IFtwcm94eUJ5cGFzc107XG5cbiAgICAgICAgICAgIHByb3h5QnlwYXNzID0gcHJveHlCeXBhc3MucmVkdWNlKChhcnIsIHJ1bGVzKSA9PiB7XG4gICAgICAgICAgICAgICAgYXNzZXJ0VHlwZShpcy5zdHJpbmcsIG51bGwsICdcInByb3h5QnlwYXNzXCIgYXJndW1lbnQnLCBydWxlcyk7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gYXJyLmNvbmNhdChydWxlcy5zcGxpdCgnLCcpKTtcbiAgICAgICAgICAgIH0sIFtdKTtcblxuICAgICAgICAgICAgdGhpcy5vcHRzLnByb3h5QnlwYXNzID0gcHJveHlCeXBhc3M7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBfdmFsaWRhdGVTY3JlZW5zaG90UGF0aCAoc2NyZWVuc2hvdFBhdGgsIHBhdGhUeXBlKSB7XG4gICAgICAgIGNvbnN0IGZvcmJpZGRlbkNoYXJzTGlzdCA9IGNoZWNrRmlsZVBhdGgoc2NyZWVuc2hvdFBhdGgpO1xuXG4gICAgICAgIGlmIChmb3JiaWRkZW5DaGFyc0xpc3QubGVuZ3RoKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEdlbmVyYWxFcnJvcihNRVNTQUdFLmZvcmJpZGRlbkNoYXJhdGVyc0luU2NyZWVuc2hvdFBhdGgsIHNjcmVlbnNob3RQYXRoLCBwYXRoVHlwZSwgcmVuZGVyRm9yYmlkZGVuQ2hhcnNMaXN0KGZvcmJpZGRlbkNoYXJzTGlzdCkpO1xuICAgIH1cblxuICAgIC8vIEFQSVxuICAgIGVtYmVkZGluZ09wdGlvbnMgKG9wdHMpIHtcbiAgICAgICAgdGhpcy5fcmVnaXN0ZXJBc3NldHMob3B0cy5hc3NldHMpO1xuICAgICAgICB0aGlzLm9wdHMuVGVzdFJ1bkN0b3IgPSBvcHRzLlRlc3RSdW5DdG9yO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHNyYyAoLi4uc291cmNlcykge1xuICAgICAgICB0aGlzLmJvb3RzdHJhcHBlci5zb3VyY2VzID0gdGhpcy5ib290c3RyYXBwZXIuc291cmNlcy5jb25jYXQoZmxhdHRlbihzb3VyY2VzKSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgYnJvd3NlcnMgKC4uLmJyb3dzZXJzKSB7XG4gICAgICAgIHRoaXMuYm9vdHN0cmFwcGVyLmJyb3dzZXJzID0gdGhpcy5ib290c3RyYXBwZXIuYnJvd3NlcnMuY29uY2F0KGZsYXR0ZW4oYnJvd3NlcnMpKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBjb25jdXJyZW5jeSAoY29uY3VycmVuY3kpIHtcbiAgICAgICAgdGhpcy5ib290c3RyYXBwZXIuY29uY3VycmVuY3kgPSBjb25jdXJyZW5jeTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICByZXBvcnRlciAobmFtZSwgb3V0U3RyZWFtKSB7XG4gICAgICAgIHRoaXMuYm9vdHN0cmFwcGVyLnJlcG9ydGVycy5wdXNoKHtcbiAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICBvdXRTdHJlYW1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgZmlsdGVyIChmaWx0ZXIpIHtcbiAgICAgICAgdGhpcy5ib290c3RyYXBwZXIuZmlsdGVyID0gZmlsdGVyO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHVzZVByb3h5IChleHRlcm5hbFByb3h5SG9zdCwgcHJveHlCeXBhc3MpIHtcbiAgICAgICAgdGhpcy5vcHRzLmV4dGVybmFsUHJveHlIb3N0ID0gZXh0ZXJuYWxQcm94eUhvc3Q7XG4gICAgICAgIHRoaXMub3B0cy5wcm94eUJ5cGFzcyAgICAgICA9IHByb3h5QnlwYXNzO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHNjcmVlbnNob3RzIChwYXRoLCB0YWtlT25GYWlscyA9IGZhbHNlLCBwYXR0ZXJuID0gbnVsbCwgcmVjb3JkU2NyZWVuQ2FwdHVyZSA9IGZhbHNlKSB7XG4gICAgICAgIHRoaXMub3B0cy50YWtlU2NyZWVuc2hvdHNPbkZhaWxzID0gdGFrZU9uRmFpbHM7XG4gICAgICAgIHRoaXMub3B0cy5zY3JlZW5zaG90UGF0aCAgICAgICAgID0gcGF0aDtcbiAgICAgICAgdGhpcy5vcHRzLnNjcmVlbnNob3RQYXRoUGF0dGVybiAgPSBwYXR0ZXJuO1xuICAgICAgICB0aGlzLm9wdHMucmVjb3JkU2NyZWVuQ2FwdHVyZSAgICA9IHJlY29yZFNjcmVlbkNhcHR1cmU7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgc3RhcnRBcHAgKGNvbW1hbmQsIGluaXREZWxheSkge1xuICAgICAgICB0aGlzLmJvb3RzdHJhcHBlci5hcHBDb21tYW5kICAgPSBjb21tYW5kO1xuICAgICAgICB0aGlzLmJvb3RzdHJhcHBlci5hcHBJbml0RGVsYXkgPSBpbml0RGVsYXk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgcnVuICh7IHNraXBKc0Vycm9ycywgZGlzYWJsZVBhZ2VSZWxvYWRzLCBxdWFyYW50aW5lTW9kZSwgZGVidWdNb2RlLCBzZWxlY3RvclRpbWVvdXQsIGFzc2VydGlvblRpbWVvdXQsIHBhZ2VMb2FkVGltZW91dCwgc3BlZWQgPSAxLCBkZWJ1Z09uRmFpbCwgc2tpcFVuY2F1Z2h0RXJyb3JzLCBzdG9wT25GaXJzdEZhaWwsIGRpc2FibGVUZXN0U3ludGF4VmFsaWRhdGlvbiB9ID0ge30pIHtcbiAgICAgICAgdGhpcy5vcHRzLnNraXBKc0Vycm9ycyAgICAgICA9ICEhc2tpcEpzRXJyb3JzO1xuICAgICAgICB0aGlzLm9wdHMuZGlzYWJsZVBhZ2VSZWxvYWRzID0gISFkaXNhYmxlUGFnZVJlbG9hZHM7XG4gICAgICAgIHRoaXMub3B0cy5xdWFyYW50aW5lTW9kZSAgICAgPSAhIXF1YXJhbnRpbmVNb2RlO1xuICAgICAgICB0aGlzLm9wdHMuZGVidWdNb2RlICAgICAgICAgID0gISFkZWJ1Z01vZGU7XG4gICAgICAgIHRoaXMub3B0cy5kZWJ1Z09uRmFpbCAgICAgICAgPSAhIWRlYnVnT25GYWlsO1xuICAgICAgICB0aGlzLm9wdHMuc2VsZWN0b3JUaW1lb3V0ICAgID0gc2VsZWN0b3JUaW1lb3V0ID09PSB2b2lkIDAgPyBERUZBVUxUX1NFTEVDVE9SX1RJTUVPVVQgOiBzZWxlY3RvclRpbWVvdXQ7XG4gICAgICAgIHRoaXMub3B0cy5hc3NlcnRpb25UaW1lb3V0ICAgPSBhc3NlcnRpb25UaW1lb3V0ID09PSB2b2lkIDAgPyBERUZBVUxUX0FTU0VSVElPTl9USU1FT1VUIDogYXNzZXJ0aW9uVGltZW91dDtcbiAgICAgICAgdGhpcy5vcHRzLnBhZ2VMb2FkVGltZW91dCAgICA9IHBhZ2VMb2FkVGltZW91dCA9PT0gdm9pZCAwID8gREVGQVVMVF9QQUdFX0xPQURfVElNRU9VVCA6IHBhZ2VMb2FkVGltZW91dDtcbiAgICAgICAgdGhpcy5vcHRzLnNwZWVkICAgICAgICAgICAgICA9IHNwZWVkO1xuICAgICAgICB0aGlzLm9wdHMuc2tpcFVuY2F1Z2h0RXJyb3JzID0gISFza2lwVW5jYXVnaHRFcnJvcnM7XG4gICAgICAgIHRoaXMub3B0cy5zdG9wT25GaXJzdEZhaWwgICAgPSAhIXN0b3BPbkZpcnN0RmFpbDtcblxuICAgICAgICB0aGlzLmJvb3RzdHJhcHBlci5kaXNhYmxlVGVzdFN5bnRheFZhbGlkYXRpb24gPSBkaXNhYmxlVGVzdFN5bnRheFZhbGlkYXRpb247XG5cbiAgICAgICAgY29uc3QgcnVuVGFza1Byb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuX3ZhbGlkYXRlUnVuT3B0aW9ucygpO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYm9vdHN0cmFwcGVyLmNyZWF0ZVJ1bm5hYmxlQ29uZmlndXJhdGlvbigpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKCh7IHJlcG9ydGVyUGx1Z2lucywgYnJvd3NlclNldCwgdGVzdHMsIHRlc3RlZEFwcCB9KSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5lbWl0KCdkb25lLWJvb3RzdHJhcHBpbmcnKTtcblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLl9ydW5UYXNrKHJlcG9ydGVyUGx1Z2lucywgYnJvd3NlclNldCwgdGVzdHMsIHRlc3RlZEFwcCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gdGhpcy5fY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UocnVuVGFza1Byb21pc2UpO1xuICAgIH1cblxuICAgIGFzeW5jIHN0b3AgKCkge1xuICAgICAgICAvLyBOT1RFOiBXaGVuIHRhc2tQcm9taXNlIGlzIGNhbmNlbGxlZCwgaXQgaXMgcmVtb3ZlZCBmcm9tXG4gICAgICAgIC8vIHRoZSBwZW5kaW5nVGFza1Byb21pc2VzIGFycmF5LCB3aGljaCBsZWFkcyB0byBzaGlmdGluZyBpbmRleGVzXG4gICAgICAgIC8vIHRvd2FyZHMgdGhlIGJlZ2lubmluZy4gU28sIHdlIG11c3QgY29weSB0aGUgYXJyYXkgaW4gb3JkZXIgdG8gaXRlcmF0ZSBpdCxcbiAgICAgICAgLy8gb3Igd2UgY2FuIHBlcmZvcm0gaXRlcmF0aW9uIGZyb20gdGhlIGVuZCB0byB0aGUgYmVnaW5uaW5nLlxuICAgICAgICBjb25zdCBjYW5jZWxsYXRpb25Qcm9taXNlcyA9IG1hcFJldmVyc2UodGhpcy5wZW5kaW5nVGFza1Byb21pc2VzLCB0YXNrUHJvbWlzZSA9PiB0YXNrUHJvbWlzZS5jYW5jZWwoKSk7XG5cbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoY2FuY2VsbGF0aW9uUHJvbWlzZXMpO1xuICAgIH1cbn1cbiJdfQ==
