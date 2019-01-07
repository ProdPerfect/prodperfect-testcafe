'use strict';

exports.__esModule = true;

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _from = require('babel-runtime/core-js/array/from');

var _from2 = _interopRequireDefault(_from);

var _create = require('babel-runtime/core-js/object/create');

var _create2 = _interopRequireDefault(_create);

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

var _lodash = require('lodash');

var _readFileRelative = require('read-file-relative');

var _promisifyEvent = require('promisify-event');

var _promisifyEvent2 = _interopRequireDefault(_promisifyEvent);

var _pinkie = require('pinkie');

var _pinkie2 = _interopRequireDefault(_pinkie);

var _mustache = require('mustache');

var _mustache2 = _interopRequireDefault(_mustache);

var _debugLogger = require('../notifications/debug-logger');

var _debugLogger2 = _interopRequireDefault(_debugLogger);

var _debugLog = require('./debug-log');

var _debugLog2 = _interopRequireDefault(_debugLog);

var _formattableAdapter = require('../errors/test-run/formattable-adapter');

var _formattableAdapter2 = _interopRequireDefault(_formattableAdapter);

var _errorList = require('../errors/error-list');

var _errorList2 = _interopRequireDefault(_errorList);

var _testRun = require('../errors/test-run/');

var _phase = require('./phase');

var _phase2 = _interopRequireDefault(_phase);

var _clientMessages = require('./client-messages');

var _clientMessages2 = _interopRequireDefault(_clientMessages);

var _type = require('./commands/type');

var _type2 = _interopRequireDefault(_type);

var _delay = require('../utils/delay');

var _delay2 = _interopRequireDefault(_delay);

var _markerSymbol = require('./marker-symbol');

var _markerSymbol2 = _interopRequireDefault(_markerSymbol);

var _testRunTracker = require('../api/test-run-tracker');

var _testRunTracker2 = _interopRequireDefault(_testRunTracker);

var _phase3 = require('../role/phase');

var _phase4 = _interopRequireDefault(_phase3);

var _pluginHost = require('../reporter/plugin-host');

var _pluginHost2 = _interopRequireDefault(_pluginHost);

var _browserConsoleMessages = require('./browser-console-messages');

var _browserConsoleMessages2 = _interopRequireDefault(_browserConsoleMessages);

var _unstableNetworkMode = require('../browser/connection/unstable-network-mode');

var _warningMessage = require('../notifications/warning-message');

var _warningMessage2 = _interopRequireDefault(_warningMessage);

var _utils = require('./commands/utils');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const lazyRequire = require('import-lazy')(require);
const SessionController = lazyRequire('./session-controller');
const ClientFunctionBuilder = lazyRequire('../client-functions/client-function-builder');
const executeJsExpression = lazyRequire('./execute-js-expression');
const BrowserManipulationQueue = lazyRequire('./browser-manipulation-queue');
const TestRunBookmark = lazyRequire('./bookmark');
const AssertionExecutor = lazyRequire('../assertions/executor');
const actionCommands = lazyRequire('./commands/actions');
const browserManipulationCommands = lazyRequire('./commands/browser-manipulation');
const serviceCommands = lazyRequire('./commands/service');

const TEST_RUN_TEMPLATE = (0, _readFileRelative.readSync)('../client/test-run/index.js.mustache');
const IFRAME_TEST_RUN_TEMPLATE = (0, _readFileRelative.readSync)('../client/test-run/iframe.js.mustache');
const TEST_DONE_CONFIRMATION_RESPONSE = 'test-done-confirmation';
const MAX_RESPONSE_DELAY = 3000;

const ALL_DRIVER_TASKS_ADDED_TO_QUEUE_EVENT = 'all-driver-tasks-added-to-queue';

class TestRun extends _events2.default {
    constructor(test, browserConnection, screenshotCapturer, warningLog, opts) {
        super();

        this[_markerSymbol2.default] = true;

        this.opts = opts;
        this.test = test;
        this.browserConnection = browserConnection;

        this.phase = _phase2.default.initial;

        this.driverTaskQueue = [];
        this.testDoneCommandQueued = false;

        this.activeDialogHandler = null;
        this.activeIframeSelector = null;
        this.speed = this.opts.speed;
        this.pageLoadTimeout = this.opts.pageLoadTimeout;

        this.disablePageReloads = test.disablePageReloads || opts.disablePageReloads && test.disablePageReloads !== false;

        this.session = SessionController.getSession(this);

        this.consoleMessages = new _browserConsoleMessages2.default();

        this.pendingRequest = null;
        this.pendingPageError = null;

        this.controller = null;
        this.ctx = (0, _create2.default)(null);
        this.fixtureCtx = null;

        this.currentRoleId = null;
        this.usedRoleStates = (0, _create2.default)(null);

        this.errs = [];

        this.lastDriverStatusId = null;
        this.lastDriverStatusResponse = null;

        this.fileDownloadingHandled = false;
        this.resolveWaitForFileDownloadingPromise = null;

        this.recordScreenCapture = this.opts.recordScreenCapture;

        this.addingDriverTasksCount = 0;

        this.debugging = this.opts.debugMode;
        this.debugOnFail = this.opts.debugOnFail;
        this.disableDebugBreakpoints = false;
        this.debugReporterPluginHost = new _pluginHost2.default({ noColors: false });

        this.browserManipulationQueue = new BrowserManipulationQueue(browserConnection, screenshotCapturer, warningLog);

        this.debugLog = new _debugLog2.default(this.browserConnection.userAgent);

        this.quarantine = null;

        this.warningLog = warningLog;

        this.injectable.scripts.push('/testcafe-core.js');
        this.injectable.scripts.push('/testcafe-ui.js');
        this.injectable.scripts.push('/testcafe-automation.js');
        this.injectable.scripts.push('/testcafe-driver.js');
        this.injectable.styles.push('/testcafe-ui-styles.css');

        this.requestHooks = (0, _from2.default)(this.test.requestHooks);

        this._initRequestHooks();
    }

    get id() {
        return this.session.id;
    }

    get injectable() {
        return this.session.injectable;
    }

    addQuarantineInfo(quarantine) {
        this.quarantine = quarantine;
    }

    addRequestHook(hook) {
        if (this.requestHooks.indexOf(hook) !== -1) return;

        this.requestHooks.push(hook);
        this._initRequestHook(hook);
    }

    removeRequestHook(hook) {
        if (this.requestHooks.indexOf(hook) === -1) return;

        (0, _lodash.pull)(this.requestHooks, hook);
        this._disposeRequestHook(hook);
    }

    _initRequestHook(hook) {
        hook.warningLog = this.warningLog;

        hook._instantiateRequestFilterRules();
        hook._instantiatedRequestFilterRules.forEach(rule => {
            this.session.addRequestEventListeners(rule, {
                onRequest: hook.onRequest.bind(hook),
                onConfigureResponse: hook._onConfigureResponse.bind(hook),
                onResponse: hook.onResponse.bind(hook)
            });
        });
    }

    _disposeRequestHook(hook) {
        hook.warningLog = null;

        hook._instantiatedRequestFilterRules.forEach(rule => {
            this.session.removeRequestEventListeners(rule);
        });
    }

    _initRequestHooks() {
        this.requestHooks.forEach(hook => this._initRequestHook(hook));
    }

    // Hammerhead payload
    _getPayloadScript() {
        this.fileDownloadingHandled = false;
        this.resolveWaitForFileDownloadingPromise = null;

        return _mustache2.default.render(TEST_RUN_TEMPLATE, {
            testRunId: (0, _stringify2.default)(this.session.id),
            browserId: (0, _stringify2.default)(this.browserConnection.id),
            browserHeartbeatRelativeUrl: (0, _stringify2.default)(this.browserConnection.heartbeatRelativeUrl),
            browserStatusRelativeUrl: (0, _stringify2.default)(this.browserConnection.statusRelativeUrl),
            browserStatusDoneRelativeUrl: (0, _stringify2.default)(this.browserConnection.statusDoneRelativeUrl),
            userAgent: (0, _stringify2.default)(this.browserConnection.userAgent),
            testName: (0, _stringify2.default)(this.test.name),
            fixtureName: (0, _stringify2.default)(this.test.fixture.name),
            selectorTimeout: this.opts.selectorTimeout,
            pageLoadTimeout: this.pageLoadTimeout,
            skipJsErrors: this.opts.skipJsErrors,
            retryTestPages: !!this.opts.retryTestPages,
            speed: this.speed,
            dialogHandler: (0, _stringify2.default)(this.activeDialogHandler)
        });
    }

    _getIframePayloadScript() {
        return _mustache2.default.render(IFRAME_TEST_RUN_TEMPLATE, {
            testRunId: (0, _stringify2.default)(this.session.id),
            selectorTimeout: this.opts.selectorTimeout,
            pageLoadTimeout: this.pageLoadTimeout,
            retryTestPages: !!this.opts.retryTestPages,
            speed: this.speed,
            dialogHandler: (0, _stringify2.default)(this.activeDialogHandler)
        });
    }

    // Hammerhead handlers
    getAuthCredentials() {
        return this.test.authCredentials;
    }

    handleFileDownload() {
        if (this.resolveWaitForFileDownloadingPromise) {
            this.resolveWaitForFileDownloadingPromise(true);
            this.resolveWaitForFileDownloadingPromise = null;
        } else this.fileDownloadingHandled = true;
    }

    handlePageError(ctx, err) {
        if (ctx.req.headers[_unstableNetworkMode.UNSTABLE_NETWORK_MODE_HEADER]) {
            ctx.closeWithError(500, err.toString());
            return;
        }

        this.pendingPageError = new _testRun.PageLoadError(err);

        ctx.redirect(ctx.toProxyUrl('about:error'));
    }

    // Test function execution
    _executeTestFn(phase, fn) {
        var _this = this;

        return (0, _asyncToGenerator3.default)(function* () {
            _this.phase = phase;

            try {
                yield fn(_this);
            } catch (err) {
                let screenshotPath = null;

                if (_this.opts.takeScreenshotsOnFails || _this.opts.recordScreenCapture)
                    // screenshotPath = await this.executeCommand(new TakeScreenshotOnFailCommand());
                    screenshotPath = yield _this.executeCommand(new browserManipulationCommands.TakeScreenshotOnFailCommand());

                _this.addError(err, screenshotPath);
                return false;
            }

            return !_this._addPendingPageErrorIfAny();
        })();
    }

    _runBeforeHook() {
        var _this2 = this;

        return (0, _asyncToGenerator3.default)(function* () {
            if (_this2.test.beforeFn) return yield _this2._executeTestFn(_phase2.default.inTestBeforeHook, _this2.test.beforeFn);

            if (_this2.test.fixture.beforeEachFn) return yield _this2._executeTestFn(_phase2.default.inFixtureBeforeEachHook, _this2.test.fixture.beforeEachFn);

            return true;
        })();
    }

    _runAfterHook() {
        var _this3 = this;

        return (0, _asyncToGenerator3.default)(function* () {
            if (_this3.test.afterFn) return yield _this3._executeTestFn(_phase2.default.inTestAfterHook, _this3.test.afterFn);

            if (_this3.test.fixture.afterEachFn) return yield _this3._executeTestFn(_phase2.default.inFixtureAfterEachHook, _this3.test.fixture.afterEachFn);

            return true;
        })();
    }

    start() {
        var _this4 = this;

        return (0, _asyncToGenerator3.default)(function* () {
            _testRunTracker2.default.activeTestRuns[_this4.session.id] = _this4;

            _this4.emit('start');

            const onDisconnected = function onDisconnected(err) {
                return _this4._disconnect(err);
            };

            _this4.browserConnection.once('disconnected', onDisconnected);

            if (yield _this4._runBeforeHook()) {
                yield _this4._executeTestFn(_phase2.default.inTest, _this4.test.fn);
                yield _this4._runAfterHook();
            }

            if (_this4.disconnected) return;

            _this4.browserConnection.removeListener('disconnected', onDisconnected);

            if (_this4.errs.length && _this4.debugOnFail) yield _this4._enqueueSetBreakpointCommand(null, _this4.debugReporterPluginHost.formatError(_this4.errs[0]));

            yield _this4.executeCommand(new serviceCommands.TestDoneCommand());

            _this4._addPendingPageErrorIfAny();

            delete _testRunTracker2.default.activeTestRuns[_this4.session.id];

            _this4.emit('done');
        })();
    }

    _evaluate(code) {
        try {
            return executeJsExpression(code, this, { skipVisibilityCheck: false });
        } catch (err) {
            return { err };
        }
    }

    // Errors
    _addPendingPageErrorIfAny() {
        if (this.pendingPageError) {
            this.addError(this.pendingPageError);
            this.pendingPageError = null;
            return true;
        }

        return false;
    }

    addError(err, screenshotPath) {
        const errList = err instanceof _errorList2.default ? err.items : [err];

        errList.forEach(item => {
            const adapter = new _formattableAdapter2.default(item, {
                userAgent: this.browserConnection.userAgent,
                screenshotPath: screenshotPath || '',
                testRunPhase: this.phase
            });

            this.errs.push(adapter);
        });
    }

    // Task queue
    _enqueueCommand(command, callsite) {
        if (this.pendingRequest) this._resolvePendingRequest(command);

        return new _pinkie2.default((resolve, reject) => {
            this.addingDriverTasksCount--;
            this.driverTaskQueue.push({ command, resolve, reject, callsite });

            if (!this.addingDriverTasksCount) this.emit(ALL_DRIVER_TASKS_ADDED_TO_QUEUE_EVENT, this.driverTaskQueue.length);
        });
    }

    get driverTaskQueueLength() {
        return this.addingDriverTasksCount ? (0, _promisifyEvent2.default)(this, ALL_DRIVER_TASKS_ADDED_TO_QUEUE_EVENT) : _pinkie2.default.resolve(this.driverTaskQueue.length);
    }

    _enqueueBrowserConsoleMessagesCommand(command, callsite) {
        var _this5 = this;

        return (0, _asyncToGenerator3.default)(function* () {
            yield _this5._enqueueCommand(command, callsite);

            return _this5.consoleMessages.getCopy();
        })();
    }

    _enqueueSetBreakpointCommand(callsite, error) {
        var _this6 = this;

        return (0, _asyncToGenerator3.default)(function* () {
            if (_this6.browserConnection.isHeadlessBrowser()) {
                _this6.warningLog.addWarning(_warningMessage2.default.debugInHeadlessError);
                return;
            }

            _debugLogger2.default.showBreakpoint(_this6.session.id, _this6.browserConnection.userAgent, callsite, error);

            _this6.debugging = yield _this6.executeCommand(new serviceCommands.SetBreakpointCommand(!!error), callsite);
        })();
    }

    _removeAllNonServiceTasks() {
        this.driverTaskQueue = this.driverTaskQueue.filter(driverTask => (0, _utils.isServiceCommand)(driverTask.command));

        this.browserManipulationQueue.removeAllNonServiceManipulations();
    }

    // Current driver task
    get currentDriverTask() {
        return this.driverTaskQueue[0];
    }

    _resolveCurrentDriverTask(result) {
        this.currentDriverTask.resolve(result);
        this.driverTaskQueue.shift();

        if (this.testDoneCommandQueued) this._removeAllNonServiceTasks();
    }

    _rejectCurrentDriverTask(err) {
        err.callsite = err.callsite || this.currentDriverTask.callsite;
        err.isRejectedDriverTask = true;

        this.currentDriverTask.reject(err);
        this._removeAllNonServiceTasks();
    }

    // Pending request
    _clearPendingRequest() {
        if (this.pendingRequest) {
            clearTimeout(this.pendingRequest.responseTimeout);
            this.pendingRequest = null;
        }
    }

    _resolvePendingRequest(command) {
        this.lastDriverStatusResponse = command;
        this.pendingRequest.resolve(command);
        this._clearPendingRequest();
    }

    // Handle driver request
    _fulfillCurrentDriverTask(driverStatus) {
        if (driverStatus.executionError) this._rejectCurrentDriverTask(driverStatus.executionError);else this._resolveCurrentDriverTask(driverStatus.result);
    }

    _handlePageErrorStatus(pageError) {
        if (this.currentDriverTask && (0, _utils.isCommandRejectableByPageError)(this.currentDriverTask.command)) {
            this._rejectCurrentDriverTask(pageError);
            this.pendingPageError = null;

            return true;
        }

        this.pendingPageError = this.pendingPageError || pageError;

        return false;
    }

    _handleDriverRequest(driverStatus) {
        const isTestDone = this.currentDriverTask && this.currentDriverTask.command.type === _type2.default.testDone;
        const pageError = this.pendingPageError || driverStatus.pageError;
        const currentTaskRejectedByError = pageError && this._handlePageErrorStatus(pageError);

        if (this.disconnected) return new _pinkie2.default((_, reject) => reject());

        this.consoleMessages.concat(driverStatus.consoleMessages);

        if (!currentTaskRejectedByError && driverStatus.isCommandResult) {
            if (isTestDone) {
                this._resolveCurrentDriverTask();

                return TEST_DONE_CONFIRMATION_RESPONSE;
            }

            this._fulfillCurrentDriverTask(driverStatus);
        }

        return this._getCurrentDriverTaskCommand();
    }

    _getCurrentDriverTaskCommand() {
        if (!this.currentDriverTask) return null;

        const command = this.currentDriverTask.command;

        if (command.type === _type2.default.navigateTo && command.stateSnapshot) this.session.useStateSnapshot(JSON.parse(command.stateSnapshot));

        return command;
    }

    // Execute command
    _executeExpression(command) {
        var _this7 = this;

        return (0, _asyncToGenerator3.default)(function* () {
            const resultVariableName = command.resultVariableName,
                  isAsyncExpression = command.isAsyncExpression;


            let expression = command.expression;

            if (isAsyncExpression) expression = `await ${expression}`;

            if (resultVariableName) expression = `${resultVariableName} = ${expression}, ${resultVariableName}`;

            if (isAsyncExpression) expression = `(async () => { return ${expression}; }).apply(this);`;

            const result = _this7._evaluate(expression);

            return isAsyncExpression ? yield result : result;
        })();
    }

    _executeAssertion(command, callsite) {
        var _this8 = this;

        return (0, _asyncToGenerator3.default)(function* () {
            const assertionTimeout = command.options.timeout === void 0 ? _this8.opts.assertionTimeout : command.options.timeout;
            const executor = new AssertionExecutor(command, assertionTimeout, callsite);

            executor.once('start-assertion-retries', function (timeout) {
                return _this8.executeCommand(new serviceCommands.ShowAssertionRetriesStatusCommand(timeout));
            });
            executor.once('end-assertion-retries', function (success) {
                return _this8.executeCommand(new serviceCommands.HideAssertionRetriesStatusCommand(success));
            });

            return executor.run();
        })();
    }

    _adjustConfigurationWithCommand(command) {
        if (command.type === _type2.default.testDone) {
            this.testDoneCommandQueued = true;
            _debugLogger2.default.hideBreakpoint(this.session.id);
        } else if (command.type === _type2.default.setNativeDialogHandler) this.activeDialogHandler = command.dialogHandler;else if (command.type === _type2.default.switchToIframe) this.activeIframeSelector = command.selector;else if (command.type === _type2.default.switchToMainWindow) this.activeIframeSelector = null;else if (command.type === _type2.default.setTestSpeed) this.speed = command.speed;else if (command.type === _type2.default.setPageLoadTimeout) this.pageLoadTimeout = command.duration;else if (command.type === _type2.default.debug) this.debugging = true;
    }

    _adjustScreenshotCommand(command) {
        var _this9 = this;

        return (0, _asyncToGenerator3.default)(function* () {
            const browserId = _this9.browserConnection.id;

            var _ref = yield _this9.browserConnection.provider.hasCustomActionForBrowser(browserId);

            const hasChromelessScreenshots = _ref.hasChromelessScreenshots;


            if (!hasChromelessScreenshots) command.generateScreenshotMark();
        })();
    }

    _setBreakpointIfNecessary(command, callsite) {
        var _this10 = this;

        return (0, _asyncToGenerator3.default)(function* () {
            if (!_this10.disableDebugBreakpoints && _this10.debugging && (0, _utils.canSetDebuggerBreakpointBeforeCommand)(command)) yield _this10._enqueueSetBreakpointCommand(callsite);
        })();
    }

    executeCommand(command, callsite) {
        var _this11 = this;

        return (0, _asyncToGenerator3.default)(function* () {
            _this11.debugLog.command(command);

            if (_this11.pendingPageError && (0, _utils.isCommandRejectableByPageError)(command)) return _this11._rejectCommandWithPageError(callsite);

            if ((0, _utils.isExecutableOnClientCommand)(command)) _this11.addingDriverTasksCount++;

            _this11._adjustConfigurationWithCommand(command);

            yield _this11._setBreakpointIfNecessary(command, callsite);

            if ((0, _utils.isScreenshotCommand)(command)) yield _this11._adjustScreenshotCommand(command);

            if ((0, _utils.isBrowserManipulationCommand)(command)) _this11.browserManipulationQueue.push(command);

            if (command.type === _type2.default.wait) return (0, _delay2.default)(command.timeout);

            if (command.type === _type2.default.setPageLoadTimeout) return null;

            if (command.type === _type2.default.debug) return yield _this11._enqueueSetBreakpointCommand(callsite);

            if (command.type === _type2.default.useRole) return yield _this11._useRole(command.role, callsite);

            if (command.type === _type2.default.assertion) return _this11._executeAssertion(command, callsite);

            if (command.type === _type2.default.executeExpression) return yield _this11._executeExpression(command, callsite);

            if (command.type === _type2.default.getBrowserConsoleMessages) return yield _this11._enqueueBrowserConsoleMessagesCommand(command, callsite);

            return _this11._enqueueCommand(command, callsite);
        })();
    }

    _rejectCommandWithPageError(callsite) {
        const err = this.pendingPageError;

        err.callsite = callsite;
        this.pendingPageError = null;

        return _pinkie2.default.reject(err);
    }

    // Role management
    getStateSnapshot() {
        var _this12 = this;

        return (0, _asyncToGenerator3.default)(function* () {
            const state = _this12.session.getStateSnapshot();

            state.storages = yield _this12.executeCommand(new serviceCommands.BackupStoragesCommand());

            return state;
        })();
    }

    switchToCleanRun() {
        var _this13 = this;

        return (0, _asyncToGenerator3.default)(function* () {
            _this13.ctx = (0, _create2.default)(null);
            _this13.fixtureCtx = (0, _create2.default)(null);
            _this13.consoleMessages = new _browserConsoleMessages2.default();

            _this13.session.useStateSnapshot(null);

            if (_this13.activeDialogHandler) {
                const removeDialogHandlerCommand = new actionCommands.SetNativeDialogHandlerCommand({ dialogHandler: { fn: null } });

                yield _this13.executeCommand(removeDialogHandlerCommand);
            }

            if (_this13.speed !== _this13.opts.speed) {
                const setSpeedCommand = new actionCommands.SetTestSpeedCommand({ speed: _this13.opts.speed });

                yield _this13.executeCommand(setSpeedCommand);
            }

            if (_this13.pageLoadTimeout !== _this13.opts.pageLoadTimeout) {
                const setPageLoadTimeoutCommand = new actionCommands.SetPageLoadTimeoutCommand({ duration: _this13.opts.pageLoadTimeout });

                yield _this13.executeCommand(setPageLoadTimeoutCommand);
            }
        })();
    }

    _getStateSnapshotFromRole(role) {
        var _this14 = this;

        return (0, _asyncToGenerator3.default)(function* () {
            const prevPhase = _this14.phase;

            _this14.phase = _phase2.default.inRoleInitializer;

            if (role.phase === _phase4.default.uninitialized) yield role.initialize(_this14);else if (role.phase === _phase4.default.pendingInitialization) yield (0, _promisifyEvent2.default)(role, 'initialized');

            if (role.initErr) throw role.initErr;

            _this14.phase = prevPhase;

            return role.stateSnapshot;
        })();
    }

    _useRole(role, callsite) {
        var _this15 = this;

        return (0, _asyncToGenerator3.default)(function* () {
            if (_this15.phase === _phase2.default.inRoleInitializer) throw new _testRun.RoleSwitchInRoleInitializerError(callsite);

            _this15.disableDebugBreakpoints = true;

            const bookmark = new TestRunBookmark(_this15, role);

            yield bookmark.init();

            if (_this15.currentRoleId) _this15.usedRoleStates[_this15.currentRoleId] = yield _this15.getStateSnapshot();

            const stateSnapshot = _this15.usedRoleStates[role.id] || (yield _this15._getStateSnapshotFromRole(role));

            _this15.session.useStateSnapshot(stateSnapshot);

            _this15.currentRoleId = role.id;

            yield bookmark.restore(callsite, stateSnapshot);

            _this15.disableDebugBreakpoints = false;
        })();
    }

    // Get current URL
    getCurrentUrl() {
        var _this16 = this;

        return (0, _asyncToGenerator3.default)(function* () {
            const builder = new ClientFunctionBuilder(function () {
                /* eslint-disable no-undef */
                return window.location.href;
                /* eslint-enable no-undef */
            }, { boundTestRun: _this16 });

            const getLocation = builder.getFunction();

            return yield getLocation();
        })();
    }

    _disconnect(err) {
        this.disconnected = true;

        this._rejectCurrentDriverTask(err);

        this.emit('disconnected', err);

        delete _testRunTracker2.default.activeTestRuns[this.session.id];
    }
}

exports.default = TestRun; // Service message handlers

const ServiceMessages = TestRun.prototype;

ServiceMessages[_clientMessages2.default.ready] = function (msg) {
    this.debugLog.driverMessage(msg);

    this._clearPendingRequest();

    // NOTE: the driver sends the status for the second time if it didn't get a response at the
    // first try. This is possible when the page was unloaded after the driver sent the status.
    if (msg.status.id === this.lastDriverStatusId) return this.lastDriverStatusResponse;

    this.lastDriverStatusId = msg.status.id;
    this.lastDriverStatusResponse = this._handleDriverRequest(msg.status);

    if (this.lastDriverStatusResponse) return this.lastDriverStatusResponse;

    // NOTE: we send an empty response after the MAX_RESPONSE_DELAY timeout is exceeded to keep connection
    // with the client and prevent the response timeout exception on the client side
    const responseTimeout = setTimeout(() => this._resolvePendingRequest(null), MAX_RESPONSE_DELAY);

    return new _pinkie2.default((resolve, reject) => {
        this.pendingRequest = { resolve, reject, responseTimeout };
    });
};

ServiceMessages[_clientMessages2.default.readyForBrowserManipulation] = (() => {
    var _ref2 = (0, _asyncToGenerator3.default)(function* (msg) {
        this.debugLog.driverMessage(msg);

        let result = null;
        let error = null;

        try {
            result = yield this.browserManipulationQueue.executePendingManipulation(msg);
        } catch (err) {
            error = err;
        }

        return { result, error };
    });

    return function (_x) {
        return _ref2.apply(this, arguments);
    };
})();

ServiceMessages[_clientMessages2.default.waitForFileDownload] = function (msg) {
    this.debugLog.driverMessage(msg);

    return new _pinkie2.default(resolve => {
        if (this.fileDownloadingHandled) {
            this.fileDownloadingHandled = false;
            resolve(true);
        } else this.resolveWaitForFileDownloadingPromise = resolve;
    });
};
module.exports = exports['default'];
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy90ZXN0LXJ1bi9pbmRleC5qcyJdLCJuYW1lcyI6WyJsYXp5UmVxdWlyZSIsInJlcXVpcmUiLCJTZXNzaW9uQ29udHJvbGxlciIsIkNsaWVudEZ1bmN0aW9uQnVpbGRlciIsImV4ZWN1dGVKc0V4cHJlc3Npb24iLCJCcm93c2VyTWFuaXB1bGF0aW9uUXVldWUiLCJUZXN0UnVuQm9va21hcmsiLCJBc3NlcnRpb25FeGVjdXRvciIsImFjdGlvbkNvbW1hbmRzIiwiYnJvd3Nlck1hbmlwdWxhdGlvbkNvbW1hbmRzIiwic2VydmljZUNvbW1hbmRzIiwiVEVTVF9SVU5fVEVNUExBVEUiLCJJRlJBTUVfVEVTVF9SVU5fVEVNUExBVEUiLCJURVNUX0RPTkVfQ09ORklSTUFUSU9OX1JFU1BPTlNFIiwiTUFYX1JFU1BPTlNFX0RFTEFZIiwiQUxMX0RSSVZFUl9UQVNLU19BRERFRF9UT19RVUVVRV9FVkVOVCIsIlRlc3RSdW4iLCJFdmVudEVtaXR0ZXIiLCJjb25zdHJ1Y3RvciIsInRlc3QiLCJicm93c2VyQ29ubmVjdGlvbiIsInNjcmVlbnNob3RDYXB0dXJlciIsIndhcm5pbmdMb2ciLCJvcHRzIiwidGVzdFJ1bk1hcmtlciIsInBoYXNlIiwiUEhBU0UiLCJpbml0aWFsIiwiZHJpdmVyVGFza1F1ZXVlIiwidGVzdERvbmVDb21tYW5kUXVldWVkIiwiYWN0aXZlRGlhbG9nSGFuZGxlciIsImFjdGl2ZUlmcmFtZVNlbGVjdG9yIiwic3BlZWQiLCJwYWdlTG9hZFRpbWVvdXQiLCJkaXNhYmxlUGFnZVJlbG9hZHMiLCJzZXNzaW9uIiwiZ2V0U2Vzc2lvbiIsImNvbnNvbGVNZXNzYWdlcyIsIkJyb3dzZXJDb25zb2xlTWVzc2FnZXMiLCJwZW5kaW5nUmVxdWVzdCIsInBlbmRpbmdQYWdlRXJyb3IiLCJjb250cm9sbGVyIiwiY3R4IiwiZml4dHVyZUN0eCIsImN1cnJlbnRSb2xlSWQiLCJ1c2VkUm9sZVN0YXRlcyIsImVycnMiLCJsYXN0RHJpdmVyU3RhdHVzSWQiLCJsYXN0RHJpdmVyU3RhdHVzUmVzcG9uc2UiLCJmaWxlRG93bmxvYWRpbmdIYW5kbGVkIiwicmVzb2x2ZVdhaXRGb3JGaWxlRG93bmxvYWRpbmdQcm9taXNlIiwicmVjb3JkU2NyZWVuQ2FwdHVyZSIsImFkZGluZ0RyaXZlclRhc2tzQ291bnQiLCJkZWJ1Z2dpbmciLCJkZWJ1Z01vZGUiLCJkZWJ1Z09uRmFpbCIsImRpc2FibGVEZWJ1Z0JyZWFrcG9pbnRzIiwiZGVidWdSZXBvcnRlclBsdWdpbkhvc3QiLCJSZXBvcnRlclBsdWdpbkhvc3QiLCJub0NvbG9ycyIsImJyb3dzZXJNYW5pcHVsYXRpb25RdWV1ZSIsImRlYnVnTG9nIiwiVGVzdFJ1bkRlYnVnTG9nIiwidXNlckFnZW50IiwicXVhcmFudGluZSIsImluamVjdGFibGUiLCJzY3JpcHRzIiwicHVzaCIsInN0eWxlcyIsInJlcXVlc3RIb29rcyIsIl9pbml0UmVxdWVzdEhvb2tzIiwiaWQiLCJhZGRRdWFyYW50aW5lSW5mbyIsImFkZFJlcXVlc3RIb29rIiwiaG9vayIsImluZGV4T2YiLCJfaW5pdFJlcXVlc3RIb29rIiwicmVtb3ZlUmVxdWVzdEhvb2siLCJfZGlzcG9zZVJlcXVlc3RIb29rIiwiX2luc3RhbnRpYXRlUmVxdWVzdEZpbHRlclJ1bGVzIiwiX2luc3RhbnRpYXRlZFJlcXVlc3RGaWx0ZXJSdWxlcyIsImZvckVhY2giLCJydWxlIiwiYWRkUmVxdWVzdEV2ZW50TGlzdGVuZXJzIiwib25SZXF1ZXN0IiwiYmluZCIsIm9uQ29uZmlndXJlUmVzcG9uc2UiLCJfb25Db25maWd1cmVSZXNwb25zZSIsIm9uUmVzcG9uc2UiLCJyZW1vdmVSZXF1ZXN0RXZlbnRMaXN0ZW5lcnMiLCJfZ2V0UGF5bG9hZFNjcmlwdCIsIk11c3RhY2hlIiwicmVuZGVyIiwidGVzdFJ1bklkIiwiYnJvd3NlcklkIiwiYnJvd3NlckhlYXJ0YmVhdFJlbGF0aXZlVXJsIiwiaGVhcnRiZWF0UmVsYXRpdmVVcmwiLCJicm93c2VyU3RhdHVzUmVsYXRpdmVVcmwiLCJzdGF0dXNSZWxhdGl2ZVVybCIsImJyb3dzZXJTdGF0dXNEb25lUmVsYXRpdmVVcmwiLCJzdGF0dXNEb25lUmVsYXRpdmVVcmwiLCJ0ZXN0TmFtZSIsIm5hbWUiLCJmaXh0dXJlTmFtZSIsImZpeHR1cmUiLCJzZWxlY3RvclRpbWVvdXQiLCJza2lwSnNFcnJvcnMiLCJyZXRyeVRlc3RQYWdlcyIsImRpYWxvZ0hhbmRsZXIiLCJfZ2V0SWZyYW1lUGF5bG9hZFNjcmlwdCIsImdldEF1dGhDcmVkZW50aWFscyIsImF1dGhDcmVkZW50aWFscyIsImhhbmRsZUZpbGVEb3dubG9hZCIsImhhbmRsZVBhZ2VFcnJvciIsImVyciIsInJlcSIsImhlYWRlcnMiLCJVTlNUQUJMRV9ORVRXT1JLX01PREVfSEVBREVSIiwiY2xvc2VXaXRoRXJyb3IiLCJ0b1N0cmluZyIsIlBhZ2VMb2FkRXJyb3IiLCJyZWRpcmVjdCIsInRvUHJveHlVcmwiLCJfZXhlY3V0ZVRlc3RGbiIsImZuIiwic2NyZWVuc2hvdFBhdGgiLCJ0YWtlU2NyZWVuc2hvdHNPbkZhaWxzIiwiZXhlY3V0ZUNvbW1hbmQiLCJUYWtlU2NyZWVuc2hvdE9uRmFpbENvbW1hbmQiLCJhZGRFcnJvciIsIl9hZGRQZW5kaW5nUGFnZUVycm9ySWZBbnkiLCJfcnVuQmVmb3JlSG9vayIsImJlZm9yZUZuIiwiaW5UZXN0QmVmb3JlSG9vayIsImJlZm9yZUVhY2hGbiIsImluRml4dHVyZUJlZm9yZUVhY2hIb29rIiwiX3J1bkFmdGVySG9vayIsImFmdGVyRm4iLCJpblRlc3RBZnRlckhvb2siLCJhZnRlckVhY2hGbiIsImluRml4dHVyZUFmdGVyRWFjaEhvb2siLCJzdGFydCIsInRlc3RSdW5UcmFja2VyIiwiYWN0aXZlVGVzdFJ1bnMiLCJlbWl0Iiwib25EaXNjb25uZWN0ZWQiLCJfZGlzY29ubmVjdCIsIm9uY2UiLCJpblRlc3QiLCJkaXNjb25uZWN0ZWQiLCJyZW1vdmVMaXN0ZW5lciIsImxlbmd0aCIsIl9lbnF1ZXVlU2V0QnJlYWtwb2ludENvbW1hbmQiLCJmb3JtYXRFcnJvciIsIlRlc3REb25lQ29tbWFuZCIsIl9ldmFsdWF0ZSIsImNvZGUiLCJza2lwVmlzaWJpbGl0eUNoZWNrIiwiZXJyTGlzdCIsIlRlc3RDYWZlRXJyb3JMaXN0IiwiaXRlbXMiLCJpdGVtIiwiYWRhcHRlciIsIlRlc3RSdW5FcnJvckZvcm1hdHRhYmxlQWRhcHRlciIsInRlc3RSdW5QaGFzZSIsIl9lbnF1ZXVlQ29tbWFuZCIsImNvbW1hbmQiLCJjYWxsc2l0ZSIsIl9yZXNvbHZlUGVuZGluZ1JlcXVlc3QiLCJQcm9taXNlIiwicmVzb2x2ZSIsInJlamVjdCIsImRyaXZlclRhc2tRdWV1ZUxlbmd0aCIsIl9lbnF1ZXVlQnJvd3NlckNvbnNvbGVNZXNzYWdlc0NvbW1hbmQiLCJnZXRDb3B5IiwiZXJyb3IiLCJpc0hlYWRsZXNzQnJvd3NlciIsImFkZFdhcm5pbmciLCJXQVJOSU5HX01FU1NBR0UiLCJkZWJ1Z0luSGVhZGxlc3NFcnJvciIsImRlYnVnTG9nZ2VyIiwic2hvd0JyZWFrcG9pbnQiLCJTZXRCcmVha3BvaW50Q29tbWFuZCIsIl9yZW1vdmVBbGxOb25TZXJ2aWNlVGFza3MiLCJmaWx0ZXIiLCJkcml2ZXJUYXNrIiwicmVtb3ZlQWxsTm9uU2VydmljZU1hbmlwdWxhdGlvbnMiLCJjdXJyZW50RHJpdmVyVGFzayIsIl9yZXNvbHZlQ3VycmVudERyaXZlclRhc2siLCJyZXN1bHQiLCJzaGlmdCIsIl9yZWplY3RDdXJyZW50RHJpdmVyVGFzayIsImlzUmVqZWN0ZWREcml2ZXJUYXNrIiwiX2NsZWFyUGVuZGluZ1JlcXVlc3QiLCJjbGVhclRpbWVvdXQiLCJyZXNwb25zZVRpbWVvdXQiLCJfZnVsZmlsbEN1cnJlbnREcml2ZXJUYXNrIiwiZHJpdmVyU3RhdHVzIiwiZXhlY3V0aW9uRXJyb3IiLCJfaGFuZGxlUGFnZUVycm9yU3RhdHVzIiwicGFnZUVycm9yIiwiX2hhbmRsZURyaXZlclJlcXVlc3QiLCJpc1Rlc3REb25lIiwidHlwZSIsIkNPTU1BTkRfVFlQRSIsInRlc3REb25lIiwiY3VycmVudFRhc2tSZWplY3RlZEJ5RXJyb3IiLCJfIiwiY29uY2F0IiwiaXNDb21tYW5kUmVzdWx0IiwiX2dldEN1cnJlbnREcml2ZXJUYXNrQ29tbWFuZCIsIm5hdmlnYXRlVG8iLCJzdGF0ZVNuYXBzaG90IiwidXNlU3RhdGVTbmFwc2hvdCIsIkpTT04iLCJwYXJzZSIsIl9leGVjdXRlRXhwcmVzc2lvbiIsInJlc3VsdFZhcmlhYmxlTmFtZSIsImlzQXN5bmNFeHByZXNzaW9uIiwiZXhwcmVzc2lvbiIsIl9leGVjdXRlQXNzZXJ0aW9uIiwiYXNzZXJ0aW9uVGltZW91dCIsIm9wdGlvbnMiLCJ0aW1lb3V0IiwiZXhlY3V0b3IiLCJTaG93QXNzZXJ0aW9uUmV0cmllc1N0YXR1c0NvbW1hbmQiLCJIaWRlQXNzZXJ0aW9uUmV0cmllc1N0YXR1c0NvbW1hbmQiLCJzdWNjZXNzIiwicnVuIiwiX2FkanVzdENvbmZpZ3VyYXRpb25XaXRoQ29tbWFuZCIsImhpZGVCcmVha3BvaW50Iiwic2V0TmF0aXZlRGlhbG9nSGFuZGxlciIsInN3aXRjaFRvSWZyYW1lIiwic2VsZWN0b3IiLCJzd2l0Y2hUb01haW5XaW5kb3ciLCJzZXRUZXN0U3BlZWQiLCJzZXRQYWdlTG9hZFRpbWVvdXQiLCJkdXJhdGlvbiIsImRlYnVnIiwiX2FkanVzdFNjcmVlbnNob3RDb21tYW5kIiwicHJvdmlkZXIiLCJoYXNDdXN0b21BY3Rpb25Gb3JCcm93c2VyIiwiaGFzQ2hyb21lbGVzc1NjcmVlbnNob3RzIiwiZ2VuZXJhdGVTY3JlZW5zaG90TWFyayIsIl9zZXRCcmVha3BvaW50SWZOZWNlc3NhcnkiLCJfcmVqZWN0Q29tbWFuZFdpdGhQYWdlRXJyb3IiLCJ3YWl0IiwidXNlUm9sZSIsIl91c2VSb2xlIiwicm9sZSIsImFzc2VydGlvbiIsImV4ZWN1dGVFeHByZXNzaW9uIiwiZ2V0QnJvd3NlckNvbnNvbGVNZXNzYWdlcyIsImdldFN0YXRlU25hcHNob3QiLCJzdGF0ZSIsInN0b3JhZ2VzIiwiQmFja3VwU3RvcmFnZXNDb21tYW5kIiwic3dpdGNoVG9DbGVhblJ1biIsInJlbW92ZURpYWxvZ0hhbmRsZXJDb21tYW5kIiwiU2V0TmF0aXZlRGlhbG9nSGFuZGxlckNvbW1hbmQiLCJzZXRTcGVlZENvbW1hbmQiLCJTZXRUZXN0U3BlZWRDb21tYW5kIiwic2V0UGFnZUxvYWRUaW1lb3V0Q29tbWFuZCIsIlNldFBhZ2VMb2FkVGltZW91dENvbW1hbmQiLCJfZ2V0U3RhdGVTbmFwc2hvdEZyb21Sb2xlIiwicHJldlBoYXNlIiwiaW5Sb2xlSW5pdGlhbGl6ZXIiLCJST0xFX1BIQVNFIiwidW5pbml0aWFsaXplZCIsImluaXRpYWxpemUiLCJwZW5kaW5nSW5pdGlhbGl6YXRpb24iLCJpbml0RXJyIiwiUm9sZVN3aXRjaEluUm9sZUluaXRpYWxpemVyRXJyb3IiLCJib29rbWFyayIsImluaXQiLCJyZXN0b3JlIiwiZ2V0Q3VycmVudFVybCIsImJ1aWxkZXIiLCJ3aW5kb3ciLCJsb2NhdGlvbiIsImhyZWYiLCJib3VuZFRlc3RSdW4iLCJnZXRMb2NhdGlvbiIsImdldEZ1bmN0aW9uIiwiU2VydmljZU1lc3NhZ2VzIiwicHJvdG90eXBlIiwiQ0xJRU5UX01FU1NBR0VTIiwicmVhZHkiLCJtc2ciLCJkcml2ZXJNZXNzYWdlIiwic3RhdHVzIiwic2V0VGltZW91dCIsInJlYWR5Rm9yQnJvd3Nlck1hbmlwdWxhdGlvbiIsImV4ZWN1dGVQZW5kaW5nTWFuaXB1bGF0aW9uIiwid2FpdEZvckZpbGVEb3dubG9hZCJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTs7OztBQUNBOztBQUNBOztBQUNBOzs7O0FBQ0E7Ozs7QUFDQTs7OztBQUNBOzs7O0FBQ0E7Ozs7QUFDQTs7OztBQUNBOzs7O0FBQ0E7O0FBQ0E7Ozs7QUFDQTs7OztBQUNBOzs7O0FBQ0E7Ozs7QUFDQTs7OztBQUNBOzs7O0FBQ0E7Ozs7QUFDQTs7OztBQUNBOzs7O0FBQ0E7O0FBQ0E7Ozs7QUFFQTs7OztBQVNBLE1BQU1BLGNBQThCQyxRQUFRLGFBQVIsRUFBdUJBLE9BQXZC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VUFBVU4sR0FBVixFQUFlO0FBQ2xFLFNBQUtuTyxRQUFMLENBQWNvTyxhQUFkLENBQTRCRCxHQUE1Qjs7QUFFQSxXQUFPLElBQUl2SCxnQkFBSixDQUFZQyxXQUFXO0FBQzFCLFlBQUksS0FBS3pILHNCQUFULEVBQWlDO0FBQzdCLGlCQUFLQSxzQkFBTCxHQUE4QixLQUE5QjtBQUNBeUgsb0JBQVEsSUFBUjtBQUNILFNBSEQsTUFLSSxLQUFLeEgsb0NBQUwsR0FBNEN3SCxPQUE1QztBQUNQLEtBUE0sQ0FBUDtBQVFILENBWEQiLCJmaWxlIjoidGVzdC1ydW4vaW5kZXguanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgRXZlbnRFbWl0dGVyIGZyb20gJ2V2ZW50cyc7XG5pbXBvcnQgeyBwdWxsIGFzIHJlbW92ZSB9IGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgeyByZWFkU3luYyBhcyByZWFkIH0gZnJvbSAncmVhZC1maWxlLXJlbGF0aXZlJztcbmltcG9ydCBwcm9taXNpZnlFdmVudCBmcm9tICdwcm9taXNpZnktZXZlbnQnO1xuaW1wb3J0IFByb21pc2UgZnJvbSAncGlua2llJztcbmltcG9ydCBNdXN0YWNoZSBmcm9tICdtdXN0YWNoZSc7XG5pbXBvcnQgZGVidWdMb2dnZXIgZnJvbSAnLi4vbm90aWZpY2F0aW9ucy9kZWJ1Zy1sb2dnZXInO1xuaW1wb3J0IFRlc3RSdW5EZWJ1Z0xvZyBmcm9tICcuL2RlYnVnLWxvZyc7XG5pbXBvcnQgVGVzdFJ1bkVycm9yRm9ybWF0dGFibGVBZGFwdGVyIGZyb20gJy4uL2Vycm9ycy90ZXN0LXJ1bi9mb3JtYXR0YWJsZS1hZGFwdGVyJztcbmltcG9ydCBUZXN0Q2FmZUVycm9yTGlzdCBmcm9tICcuLi9lcnJvcnMvZXJyb3ItbGlzdCc7XG5pbXBvcnQgeyBQYWdlTG9hZEVycm9yLCBSb2xlU3dpdGNoSW5Sb2xlSW5pdGlhbGl6ZXJFcnJvciB9IGZyb20gJy4uL2Vycm9ycy90ZXN0LXJ1bi8nO1xuaW1wb3J0IFBIQVNFIGZyb20gJy4vcGhhc2UnO1xuaW1wb3J0IENMSUVOVF9NRVNTQUdFUyBmcm9tICcuL2NsaWVudC1tZXNzYWdlcyc7XG5pbXBvcnQgQ09NTUFORF9UWVBFIGZyb20gJy4vY29tbWFuZHMvdHlwZSc7XG5pbXBvcnQgZGVsYXkgZnJvbSAnLi4vdXRpbHMvZGVsYXknO1xuaW1wb3J0IHRlc3RSdW5NYXJrZXIgZnJvbSAnLi9tYXJrZXItc3ltYm9sJztcbmltcG9ydCB0ZXN0UnVuVHJhY2tlciBmcm9tICcuLi9hcGkvdGVzdC1ydW4tdHJhY2tlcic7XG5pbXBvcnQgUk9MRV9QSEFTRSBmcm9tICcuLi9yb2xlL3BoYXNlJztcbmltcG9ydCBSZXBvcnRlclBsdWdpbkhvc3QgZnJvbSAnLi4vcmVwb3J0ZXIvcGx1Z2luLWhvc3QnO1xuaW1wb3J0IEJyb3dzZXJDb25zb2xlTWVzc2FnZXMgZnJvbSAnLi9icm93c2VyLWNvbnNvbGUtbWVzc2FnZXMnO1xuaW1wb3J0IHsgVU5TVEFCTEVfTkVUV09SS19NT0RFX0hFQURFUiB9IGZyb20gJy4uL2Jyb3dzZXIvY29ubmVjdGlvbi91bnN0YWJsZS1uZXR3b3JrLW1vZGUnO1xuaW1wb3J0IFdBUk5JTkdfTUVTU0FHRSBmcm9tICcuLi9ub3RpZmljYXRpb25zL3dhcm5pbmctbWVzc2FnZSc7XG5cbmltcG9ydCB7XG4gICAgaXNDb21tYW5kUmVqZWN0YWJsZUJ5UGFnZUVycm9yLFxuICAgIGlzQnJvd3Nlck1hbmlwdWxhdGlvbkNvbW1hbmQsXG4gICAgaXNTY3JlZW5zaG90Q29tbWFuZCxcbiAgICBpc1NlcnZpY2VDb21tYW5kLFxuICAgIGNhblNldERlYnVnZ2VyQnJlYWtwb2ludEJlZm9yZUNvbW1hbmQsXG4gICAgaXNFeGVjdXRhYmxlT25DbGllbnRDb21tYW5kXG59IGZyb20gJy4vY29tbWFuZHMvdXRpbHMnO1xuXG5jb25zdCBsYXp5UmVxdWlyZSAgICAgICAgICAgICAgICAgPSByZXF1aXJlKCdpbXBvcnQtbGF6eScpKHJlcXVpcmUpO1xuY29uc3QgU2Vzc2lvbkNvbnRyb2xsZXIgICAgICAgICAgID0gbGF6eVJlcXVpcmUoJy4vc2Vzc2lvbi1jb250cm9sbGVyJyk7XG5jb25zdCBDbGllbnRGdW5jdGlvbkJ1aWxkZXIgICAgICAgPSBsYXp5UmVxdWlyZSgnLi4vY2xpZW50LWZ1bmN0aW9ucy9jbGllbnQtZnVuY3Rpb24tYnVpbGRlcicpO1xuY29uc3QgZXhlY3V0ZUpzRXhwcmVzc2lvbiAgICAgICAgID0gbGF6eVJlcXVpcmUoJy4vZXhlY3V0ZS1qcy1leHByZXNzaW9uJyk7XG5jb25zdCBCcm93c2VyTWFuaXB1bGF0aW9uUXVldWUgICAgPSBsYXp5UmVxdWlyZSgnLi9icm93c2VyLW1hbmlwdWxhdGlvbi1xdWV1ZScpO1xuY29uc3QgVGVzdFJ1bkJvb2ttYXJrICAgICAgICAgICAgID0gbGF6eVJlcXVpcmUoJy4vYm9va21hcmsnKTtcbmNvbnN0IEFzc2VydGlvbkV4ZWN1dG9yICAgICAgICAgICA9IGxhenlSZXF1aXJlKCcuLi9hc3NlcnRpb25zL2V4ZWN1dG9yJyk7XG5jb25zdCBhY3Rpb25Db21tYW5kcyAgICAgICAgICAgICAgPSBsYXp5UmVxdWlyZSgnLi9jb21tYW5kcy9hY3Rpb25zJyk7XG5jb25zdCBicm93c2VyTWFuaXB1bGF0aW9uQ29tbWFuZHMgPSBsYXp5UmVxdWlyZSgnLi9jb21tYW5kcy9icm93c2VyLW1hbmlwdWxhdGlvbicpO1xuY29uc3Qgc2VydmljZUNvbW1hbmRzICAgICAgICAgICAgID0gbGF6eVJlcXVpcmUoJy4vY29tbWFuZHMvc2VydmljZScpO1xuXG5cbmNvbnN0IFRFU1RfUlVOX1RFTVBMQVRFICAgICAgICAgICAgICAgPSByZWFkKCcuLi9jbGllbnQvdGVzdC1ydW4vaW5kZXguanMubXVzdGFjaGUnKTtcbmNvbnN0IElGUkFNRV9URVNUX1JVTl9URU1QTEFURSAgICAgICAgPSByZWFkKCcuLi9jbGllbnQvdGVzdC1ydW4vaWZyYW1lLmpzLm11c3RhY2hlJyk7XG5jb25zdCBURVNUX0RPTkVfQ09ORklSTUFUSU9OX1JFU1BPTlNFID0gJ3Rlc3QtZG9uZS1jb25maXJtYXRpb24nO1xuY29uc3QgTUFYX1JFU1BPTlNFX0RFTEFZICAgICAgICAgICAgICA9IDMwMDA7XG5cbmNvbnN0IEFMTF9EUklWRVJfVEFTS1NfQURERURfVE9fUVVFVUVfRVZFTlQgPSAnYWxsLWRyaXZlci10YXNrcy1hZGRlZC10by1xdWV1ZSc7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFRlc3RSdW4gZXh0ZW5kcyBFdmVudEVtaXR0ZXIge1xuICAgIGNvbnN0cnVjdG9yICh0ZXN0LCBicm93c2VyQ29ubmVjdGlvbiwgc2NyZWVuc2hvdENhcHR1cmVyLCB3YXJuaW5nTG9nLCBvcHRzKSB7XG4gICAgICAgIHN1cGVyKCk7XG5cbiAgICAgICAgdGhpc1t0ZXN0UnVuTWFya2VyXSA9IHRydWU7XG5cbiAgICAgICAgdGhpcy5vcHRzICAgICAgICAgICAgICA9IG9wdHM7XG4gICAgICAgIHRoaXMudGVzdCAgICAgICAgICAgICAgPSB0ZXN0O1xuICAgICAgICB0aGlzLmJyb3dzZXJDb25uZWN0aW9uID0gYnJvd3NlckNvbm5lY3Rpb247XG5cbiAgICAgICAgdGhpcy5waGFzZSA9IFBIQVNFLmluaXRpYWw7XG5cbiAgICAgICAgdGhpcy5kcml2ZXJUYXNrUXVldWUgICAgICAgPSBbXTtcbiAgICAgICAgdGhpcy50ZXN0RG9uZUNvbW1hbmRRdWV1ZWQgPSBmYWxzZTtcblxuICAgICAgICB0aGlzLmFjdGl2ZURpYWxvZ0hhbmRsZXIgID0gbnVsbDtcbiAgICAgICAgdGhpcy5hY3RpdmVJZnJhbWVTZWxlY3RvciA9IG51bGw7XG4gICAgICAgIHRoaXMuc3BlZWQgICAgICAgICAgICAgICAgPSB0aGlzLm9wdHMuc3BlZWQ7XG4gICAgICAgIHRoaXMucGFnZUxvYWRUaW1lb3V0ICAgICAgPSB0aGlzLm9wdHMucGFnZUxvYWRUaW1lb3V0O1xuXG4gICAgICAgIHRoaXMuZGlzYWJsZVBhZ2VSZWxvYWRzID0gdGVzdC5kaXNhYmxlUGFnZVJlbG9hZHMgfHwgb3B0cy5kaXNhYmxlUGFnZVJlbG9hZHMgJiYgdGVzdC5kaXNhYmxlUGFnZVJlbG9hZHMgIT09IGZhbHNlO1xuXG4gICAgICAgIHRoaXMuc2Vzc2lvbiA9IFNlc3Npb25Db250cm9sbGVyLmdldFNlc3Npb24odGhpcyk7XG5cbiAgICAgICAgdGhpcy5jb25zb2xlTWVzc2FnZXMgPSBuZXcgQnJvd3NlckNvbnNvbGVNZXNzYWdlcygpO1xuXG4gICAgICAgIHRoaXMucGVuZGluZ1JlcXVlc3QgICA9IG51bGw7XG4gICAgICAgIHRoaXMucGVuZGluZ1BhZ2VFcnJvciA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5jb250cm9sbGVyID0gbnVsbDtcbiAgICAgICAgdGhpcy5jdHggICAgICAgID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICAgICAgdGhpcy5maXh0dXJlQ3R4ID0gbnVsbDtcblxuICAgICAgICB0aGlzLmN1cnJlbnRSb2xlSWQgID0gbnVsbDtcbiAgICAgICAgdGhpcy51c2VkUm9sZVN0YXRlcyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cbiAgICAgICAgdGhpcy5lcnJzID0gW107XG5cbiAgICAgICAgdGhpcy5sYXN0RHJpdmVyU3RhdHVzSWQgICAgICAgPSBudWxsO1xuICAgICAgICB0aGlzLmxhc3REcml2ZXJTdGF0dXNSZXNwb25zZSA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5maWxlRG93bmxvYWRpbmdIYW5kbGVkICAgICAgICAgICAgICAgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5yZXNvbHZlV2FpdEZvckZpbGVEb3dubG9hZGluZ1Byb21pc2UgPSBudWxsO1xuXG4gICAgICAgIHRoaXMucmVjb3JkU2NyZWVuQ2FwdHVyZSA9IHRoaXMub3B0cy5yZWNvcmRTY3JlZW5DYXB0dXJlO1xuXG4gICAgICAgIHRoaXMuYWRkaW5nRHJpdmVyVGFza3NDb3VudCA9IDA7XG5cbiAgICAgICAgdGhpcy5kZWJ1Z2dpbmcgICAgICAgICAgICAgICA9IHRoaXMub3B0cy5kZWJ1Z01vZGU7XG4gICAgICAgIHRoaXMuZGVidWdPbkZhaWwgICAgICAgICAgICAgPSB0aGlzLm9wdHMuZGVidWdPbkZhaWw7XG4gICAgICAgIHRoaXMuZGlzYWJsZURlYnVnQnJlYWtwb2ludHMgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5kZWJ1Z1JlcG9ydGVyUGx1Z2luSG9zdCA9IG5ldyBSZXBvcnRlclBsdWdpbkhvc3QoeyBub0NvbG9yczogZmFsc2UgfSk7XG5cbiAgICAgICAgdGhpcy5icm93c2VyTWFuaXB1bGF0aW9uUXVldWUgPSBuZXcgQnJvd3Nlck1hbmlwdWxhdGlvblF1ZXVlKGJyb3dzZXJDb25uZWN0aW9uLCBzY3JlZW5zaG90Q2FwdHVyZXIsIHdhcm5pbmdMb2cpO1xuXG4gICAgICAgIHRoaXMuZGVidWdMb2cgPSBuZXcgVGVzdFJ1bkRlYnVnTG9nKHRoaXMuYnJvd3NlckNvbm5lY3Rpb24udXNlckFnZW50KTtcblxuICAgICAgICB0aGlzLnF1YXJhbnRpbmUgPSBudWxsO1xuXG4gICAgICAgIHRoaXMud2FybmluZ0xvZyA9IHdhcm5pbmdMb2c7XG5cbiAgICAgICAgdGhpcy5pbmplY3RhYmxlLnNjcmlwdHMucHVzaCgnL3Rlc3RjYWZlLWNvcmUuanMnKTtcbiAgICAgICAgdGhpcy5pbmplY3RhYmxlLnNjcmlwdHMucHVzaCgnL3Rlc3RjYWZlLXVpLmpzJyk7XG4gICAgICAgIHRoaXMuaW5qZWN0YWJsZS5zY3JpcHRzLnB1c2goJy90ZXN0Y2FmZS1hdXRvbWF0aW9uLmpzJyk7XG4gICAgICAgIHRoaXMuaW5qZWN0YWJsZS5zY3JpcHRzLnB1c2goJy90ZXN0Y2FmZS1kcml2ZXIuanMnKTtcbiAgICAgICAgdGhpcy5pbmplY3RhYmxlLnN0eWxlcy5wdXNoKCcvdGVzdGNhZmUtdWktc3R5bGVzLmNzcycpO1xuXG4gICAgICAgIHRoaXMucmVxdWVzdEhvb2tzID0gQXJyYXkuZnJvbSh0aGlzLnRlc3QucmVxdWVzdEhvb2tzKTtcblxuICAgICAgICB0aGlzLl9pbml0UmVxdWVzdEhvb2tzKCk7XG4gICAgfVxuXG4gICAgZ2V0IGlkICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5pZDtcbiAgICB9XG5cbiAgICBnZXQgaW5qZWN0YWJsZSAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uaW5qZWN0YWJsZTtcbiAgICB9XG5cbiAgICBhZGRRdWFyYW50aW5lSW5mbyAocXVhcmFudGluZSkge1xuICAgICAgICB0aGlzLnF1YXJhbnRpbmUgPSBxdWFyYW50aW5lO1xuICAgIH1cblxuICAgIGFkZFJlcXVlc3RIb29rIChob29rKSB7XG4gICAgICAgIGlmICh0aGlzLnJlcXVlc3RIb29rcy5pbmRleE9mKGhvb2spICE9PSAtMSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLnJlcXVlc3RIb29rcy5wdXNoKGhvb2spO1xuICAgICAgICB0aGlzLl9pbml0UmVxdWVzdEhvb2soaG9vayk7XG4gICAgfVxuXG4gICAgcmVtb3ZlUmVxdWVzdEhvb2sgKGhvb2spIHtcbiAgICAgICAgaWYgKHRoaXMucmVxdWVzdEhvb2tzLmluZGV4T2YoaG9vaykgPT09IC0xKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHJlbW92ZSh0aGlzLnJlcXVlc3RIb29rcywgaG9vayk7XG4gICAgICAgIHRoaXMuX2Rpc3Bvc2VSZXF1ZXN0SG9vayhob29rKTtcbiAgICB9XG5cbiAgICBfaW5pdFJlcXVlc3RIb29rIChob29rKSB7XG4gICAgICAgIGhvb2sud2FybmluZ0xvZyA9IHRoaXMud2FybmluZ0xvZztcblxuICAgICAgICBob29rLl9pbnN0YW50aWF0ZVJlcXVlc3RGaWx0ZXJSdWxlcygpO1xuICAgICAgICBob29rLl9pbnN0YW50aWF0ZWRSZXF1ZXN0RmlsdGVyUnVsZXMuZm9yRWFjaChydWxlID0+IHtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5hZGRSZXF1ZXN0RXZlbnRMaXN0ZW5lcnMocnVsZSwge1xuICAgICAgICAgICAgICAgIG9uUmVxdWVzdDogICAgICAgICAgIGhvb2sub25SZXF1ZXN0LmJpbmQoaG9vayksXG4gICAgICAgICAgICAgICAgb25Db25maWd1cmVSZXNwb25zZTogaG9vay5fb25Db25maWd1cmVSZXNwb25zZS5iaW5kKGhvb2spLFxuICAgICAgICAgICAgICAgIG9uUmVzcG9uc2U6ICAgICAgICAgIGhvb2sub25SZXNwb25zZS5iaW5kKGhvb2spXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgX2Rpc3Bvc2VSZXF1ZXN0SG9vayAoaG9vaykge1xuICAgICAgICBob29rLndhcm5pbmdMb2cgPSBudWxsO1xuXG4gICAgICAgIGhvb2suX2luc3RhbnRpYXRlZFJlcXVlc3RGaWx0ZXJSdWxlcy5mb3JFYWNoKHJ1bGUgPT4ge1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZVJlcXVlc3RFdmVudExpc3RlbmVycyhydWxlKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgX2luaXRSZXF1ZXN0SG9va3MgKCkge1xuICAgICAgICB0aGlzLnJlcXVlc3RIb29rcy5mb3JFYWNoKGhvb2sgPT4gdGhpcy5faW5pdFJlcXVlc3RIb29rKGhvb2spKTtcbiAgICB9XG5cbiAgICAvLyBIYW1tZXJoZWFkIHBheWxvYWRcbiAgICBfZ2V0UGF5bG9hZFNjcmlwdCAoKSB7XG4gICAgICAgIHRoaXMuZmlsZURvd25sb2FkaW5nSGFuZGxlZCAgICAgICAgICAgICAgID0gZmFsc2U7XG4gICAgICAgIHRoaXMucmVzb2x2ZVdhaXRGb3JGaWxlRG93bmxvYWRpbmdQcm9taXNlID0gbnVsbDtcblxuICAgICAgICByZXR1cm4gTXVzdGFjaGUucmVuZGVyKFRFU1RfUlVOX1RFTVBMQVRFLCB7XG4gICAgICAgICAgICB0ZXN0UnVuSWQ6ICAgICAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeSh0aGlzLnNlc3Npb24uaWQpLFxuICAgICAgICAgICAgYnJvd3NlcklkOiAgICAgICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkodGhpcy5icm93c2VyQ29ubmVjdGlvbi5pZCksXG4gICAgICAgICAgICBicm93c2VySGVhcnRiZWF0UmVsYXRpdmVVcmw6ICBKU09OLnN0cmluZ2lmeSh0aGlzLmJyb3dzZXJDb25uZWN0aW9uLmhlYXJ0YmVhdFJlbGF0aXZlVXJsKSxcbiAgICAgICAgICAgIGJyb3dzZXJTdGF0dXNSZWxhdGl2ZVVybDogICAgIEpTT04uc3RyaW5naWZ5KHRoaXMuYnJvd3NlckNvbm5lY3Rpb24uc3RhdHVzUmVsYXRpdmVVcmwpLFxuICAgICAgICAgICAgYnJvd3NlclN0YXR1c0RvbmVSZWxhdGl2ZVVybDogSlNPTi5zdHJpbmdpZnkodGhpcy5icm93c2VyQ29ubmVjdGlvbi5zdGF0dXNEb25lUmVsYXRpdmVVcmwpLFxuICAgICAgICAgICAgdXNlckFnZW50OiAgICAgICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkodGhpcy5icm93c2VyQ29ubmVjdGlvbi51c2VyQWdlbnQpLFxuICAgICAgICAgICAgdGVzdE5hbWU6ICAgICAgICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkodGhpcy50ZXN0Lm5hbWUpLFxuICAgICAgICAgICAgZml4dHVyZU5hbWU6ICAgICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkodGhpcy50ZXN0LmZpeHR1cmUubmFtZSksXG4gICAgICAgICAgICBzZWxlY3RvclRpbWVvdXQ6ICAgICAgICAgICAgICB0aGlzLm9wdHMuc2VsZWN0b3JUaW1lb3V0LFxuICAgICAgICAgICAgcGFnZUxvYWRUaW1lb3V0OiAgICAgICAgICAgICAgdGhpcy5wYWdlTG9hZFRpbWVvdXQsXG4gICAgICAgICAgICBza2lwSnNFcnJvcnM6ICAgICAgICAgICAgICAgICB0aGlzLm9wdHMuc2tpcEpzRXJyb3JzLFxuICAgICAgICAgICAgcmV0cnlUZXN0UGFnZXM6ICAgICAgICAgICAgICAgISF0aGlzLm9wdHMucmV0cnlUZXN0UGFnZXMsXG4gICAgICAgICAgICBzcGVlZDogICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNwZWVkLFxuICAgICAgICAgICAgZGlhbG9nSGFuZGxlcjogICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkodGhpcy5hY3RpdmVEaWFsb2dIYW5kbGVyKVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBfZ2V0SWZyYW1lUGF5bG9hZFNjcmlwdCAoKSB7XG4gICAgICAgIHJldHVybiBNdXN0YWNoZS5yZW5kZXIoSUZSQU1FX1RFU1RfUlVOX1RFTVBMQVRFLCB7XG4gICAgICAgICAgICB0ZXN0UnVuSWQ6ICAgICAgIEpTT04uc3RyaW5naWZ5KHRoaXMuc2Vzc2lvbi5pZCksXG4gICAgICAgICAgICBzZWxlY3RvclRpbWVvdXQ6IHRoaXMub3B0cy5zZWxlY3RvclRpbWVvdXQsXG4gICAgICAgICAgICBwYWdlTG9hZFRpbWVvdXQ6IHRoaXMucGFnZUxvYWRUaW1lb3V0LFxuICAgICAgICAgICAgcmV0cnlUZXN0UGFnZXM6ICAhIXRoaXMub3B0cy5yZXRyeVRlc3RQYWdlcyxcbiAgICAgICAgICAgIHNwZWVkOiAgICAgICAgICAgdGhpcy5zcGVlZCxcbiAgICAgICAgICAgIGRpYWxvZ0hhbmRsZXI6ICAgSlNPTi5zdHJpbmdpZnkodGhpcy5hY3RpdmVEaWFsb2dIYW5kbGVyKVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBIYW1tZXJoZWFkIGhhbmRsZXJzXG4gICAgZ2V0QXV0aENyZWRlbnRpYWxzICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudGVzdC5hdXRoQ3JlZGVudGlhbHM7XG4gICAgfVxuXG4gICAgaGFuZGxlRmlsZURvd25sb2FkICgpIHtcbiAgICAgICAgaWYgKHRoaXMucmVzb2x2ZVdhaXRGb3JGaWxlRG93bmxvYWRpbmdQcm9taXNlKSB7XG4gICAgICAgICAgICB0aGlzLnJlc29sdmVXYWl0Rm9yRmlsZURvd25sb2FkaW5nUHJvbWlzZSh0cnVlKTtcbiAgICAgICAgICAgIHRoaXMucmVzb2x2ZVdhaXRGb3JGaWxlRG93bmxvYWRpbmdQcm9taXNlID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aGlzLmZpbGVEb3dubG9hZGluZ0hhbmRsZWQgPSB0cnVlO1xuICAgIH1cblxuICAgIGhhbmRsZVBhZ2VFcnJvciAoY3R4LCBlcnIpIHtcbiAgICAgICAgaWYgKGN0eC5yZXEuaGVhZGVyc1tVTlNUQUJMRV9ORVRXT1JLX01PREVfSEVBREVSXSkge1xuICAgICAgICAgICAgY3R4LmNsb3NlV2l0aEVycm9yKDUwMCwgZXJyLnRvU3RyaW5nKCkpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5wZW5kaW5nUGFnZUVycm9yID0gbmV3IFBhZ2VMb2FkRXJyb3IoZXJyKTtcblxuICAgICAgICBjdHgucmVkaXJlY3QoY3R4LnRvUHJveHlVcmwoJ2Fib3V0OmVycm9yJykpO1xuICAgIH1cblxuICAgIC8vIFRlc3QgZnVuY3Rpb24gZXhlY3V0aW9uXG4gICAgYXN5bmMgX2V4ZWN1dGVUZXN0Rm4gKHBoYXNlLCBmbikge1xuICAgICAgICB0aGlzLnBoYXNlID0gcGhhc2U7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IGZuKHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGxldCBzY3JlZW5zaG90UGF0aCA9IG51bGw7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLm9wdHMudGFrZVNjcmVlbnNob3RzT25GYWlscyB8fCB0aGlzLm9wdHMucmVjb3JkU2NyZWVuQ2FwdHVyZSlcbiAgICAgICAgICAgICAgICAvLyBzY3JlZW5zaG90UGF0aCA9IGF3YWl0IHRoaXMuZXhlY3V0ZUNvbW1hbmQobmV3IFRha2VTY3JlZW5zaG90T25GYWlsQ29tbWFuZCgpKTtcbiAgICAgICAgICAgICAgICBzY3JlZW5zaG90UGF0aCA9IGF3YWl0IHRoaXMuZXhlY3V0ZUNvbW1hbmQobmV3IGJyb3dzZXJNYW5pcHVsYXRpb25Db21tYW5kcy5UYWtlU2NyZWVuc2hvdE9uRmFpbENvbW1hbmQoKSk7XG5cbiAgICAgICAgICAgIHRoaXMuYWRkRXJyb3IoZXJyLCBzY3JlZW5zaG90UGF0aCk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gIXRoaXMuX2FkZFBlbmRpbmdQYWdlRXJyb3JJZkFueSgpO1xuICAgIH1cblxuICAgIGFzeW5jIF9ydW5CZWZvcmVIb29rICgpIHtcbiAgICAgICAgaWYgKHRoaXMudGVzdC5iZWZvcmVGbilcbiAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLl9leGVjdXRlVGVzdEZuKFBIQVNFLmluVGVzdEJlZm9yZUhvb2ssIHRoaXMudGVzdC5iZWZvcmVGbik7XG5cbiAgICAgICAgaWYgKHRoaXMudGVzdC5maXh0dXJlLmJlZm9yZUVhY2hGbilcbiAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLl9leGVjdXRlVGVzdEZuKFBIQVNFLmluRml4dHVyZUJlZm9yZUVhY2hIb29rLCB0aGlzLnRlc3QuZml4dHVyZS5iZWZvcmVFYWNoRm4pO1xuXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGFzeW5jIF9ydW5BZnRlckhvb2sgKCkge1xuICAgICAgICBpZiAodGhpcy50ZXN0LmFmdGVyRm4pXG4gICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5fZXhlY3V0ZVRlc3RGbihQSEFTRS5pblRlc3RBZnRlckhvb2ssIHRoaXMudGVzdC5hZnRlckZuKTtcblxuICAgICAgICBpZiAodGhpcy50ZXN0LmZpeHR1cmUuYWZ0ZXJFYWNoRm4pXG4gICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5fZXhlY3V0ZVRlc3RGbihQSEFTRS5pbkZpeHR1cmVBZnRlckVhY2hIb29rLCB0aGlzLnRlc3QuZml4dHVyZS5hZnRlckVhY2hGbik7XG5cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgYXN5bmMgc3RhcnQgKCkge1xuICAgICAgICB0ZXN0UnVuVHJhY2tlci5hY3RpdmVUZXN0UnVuc1t0aGlzLnNlc3Npb24uaWRdID0gdGhpcztcblxuICAgICAgICB0aGlzLmVtaXQoJ3N0YXJ0Jyk7XG5cbiAgICAgICAgY29uc3Qgb25EaXNjb25uZWN0ZWQgPSBlcnIgPT4gdGhpcy5fZGlzY29ubmVjdChlcnIpO1xuXG4gICAgICAgIHRoaXMuYnJvd3NlckNvbm5lY3Rpb24ub25jZSgnZGlzY29ubmVjdGVkJywgb25EaXNjb25uZWN0ZWQpO1xuXG4gICAgICAgIGlmIChhd2FpdCB0aGlzLl9ydW5CZWZvcmVIb29rKCkpIHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuX2V4ZWN1dGVUZXN0Rm4oUEhBU0UuaW5UZXN0LCB0aGlzLnRlc3QuZm4pO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5fcnVuQWZ0ZXJIb29rKCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5kaXNjb25uZWN0ZWQpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdGhpcy5icm93c2VyQ29ubmVjdGlvbi5yZW1vdmVMaXN0ZW5lcignZGlzY29ubmVjdGVkJywgb25EaXNjb25uZWN0ZWQpO1xuXG4gICAgICAgIGlmICh0aGlzLmVycnMubGVuZ3RoICYmIHRoaXMuZGVidWdPbkZhaWwpXG4gICAgICAgICAgICBhd2FpdCB0aGlzLl9lbnF1ZXVlU2V0QnJlYWtwb2ludENvbW1hbmQobnVsbCwgdGhpcy5kZWJ1Z1JlcG9ydGVyUGx1Z2luSG9zdC5mb3JtYXRFcnJvcih0aGlzLmVycnNbMF0pKTtcblxuICAgICAgICBhd2FpdCB0aGlzLmV4ZWN1dGVDb21tYW5kKG5ldyBzZXJ2aWNlQ29tbWFuZHMuVGVzdERvbmVDb21tYW5kKCkpO1xuXG4gICAgICAgIHRoaXMuX2FkZFBlbmRpbmdQYWdlRXJyb3JJZkFueSgpO1xuXG4gICAgICAgIGRlbGV0ZSB0ZXN0UnVuVHJhY2tlci5hY3RpdmVUZXN0UnVuc1t0aGlzLnNlc3Npb24uaWRdO1xuXG4gICAgICAgIHRoaXMuZW1pdCgnZG9uZScpO1xuICAgIH1cblxuICAgIF9ldmFsdWF0ZSAoY29kZSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmV0dXJuIGV4ZWN1dGVKc0V4cHJlc3Npb24oY29kZSwgdGhpcywgeyBza2lwVmlzaWJpbGl0eUNoZWNrOiBmYWxzZSB9KTtcbiAgICAgICAgfVxuICAgICAgICBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICByZXR1cm4geyBlcnIgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEVycm9yc1xuICAgIF9hZGRQZW5kaW5nUGFnZUVycm9ySWZBbnkgKCkge1xuICAgICAgICBpZiAodGhpcy5wZW5kaW5nUGFnZUVycm9yKSB7XG4gICAgICAgICAgICB0aGlzLmFkZEVycm9yKHRoaXMucGVuZGluZ1BhZ2VFcnJvcik7XG4gICAgICAgICAgICB0aGlzLnBlbmRpbmdQYWdlRXJyb3IgPSBudWxsO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgYWRkRXJyb3IgKGVyciwgc2NyZWVuc2hvdFBhdGgpIHtcbiAgICAgICAgY29uc3QgZXJyTGlzdCA9IGVyciBpbnN0YW5jZW9mIFRlc3RDYWZlRXJyb3JMaXN0ID8gZXJyLml0ZW1zIDogW2Vycl07XG5cbiAgICAgICAgZXJyTGlzdC5mb3JFYWNoKGl0ZW0gPT4ge1xuICAgICAgICAgICAgY29uc3QgYWRhcHRlciA9IG5ldyBUZXN0UnVuRXJyb3JGb3JtYXR0YWJsZUFkYXB0ZXIoaXRlbSwge1xuICAgICAgICAgICAgICAgIHVzZXJBZ2VudDogICAgICB0aGlzLmJyb3dzZXJDb25uZWN0aW9uLnVzZXJBZ2VudCxcbiAgICAgICAgICAgICAgICBzY3JlZW5zaG90UGF0aDogc2NyZWVuc2hvdFBhdGggfHwgJycsXG4gICAgICAgICAgICAgICAgdGVzdFJ1blBoYXNlOiAgIHRoaXMucGhhc2VcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICB0aGlzLmVycnMucHVzaChhZGFwdGVyKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gVGFzayBxdWV1ZVxuICAgIF9lbnF1ZXVlQ29tbWFuZCAoY29tbWFuZCwgY2FsbHNpdGUpIHtcbiAgICAgICAgaWYgKHRoaXMucGVuZGluZ1JlcXVlc3QpXG4gICAgICAgICAgICB0aGlzLl9yZXNvbHZlUGVuZGluZ1JlcXVlc3QoY29tbWFuZCk7XG5cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIHRoaXMuYWRkaW5nRHJpdmVyVGFza3NDb3VudC0tO1xuICAgICAgICAgICAgdGhpcy5kcml2ZXJUYXNrUXVldWUucHVzaCh7IGNvbW1hbmQsIHJlc29sdmUsIHJlamVjdCwgY2FsbHNpdGUgfSk7XG5cbiAgICAgICAgICAgIGlmICghdGhpcy5hZGRpbmdEcml2ZXJUYXNrc0NvdW50KVxuICAgICAgICAgICAgICAgIHRoaXMuZW1pdChBTExfRFJJVkVSX1RBU0tTX0FEREVEX1RPX1FVRVVFX0VWRU5ULCB0aGlzLmRyaXZlclRhc2tRdWV1ZS5sZW5ndGgpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBnZXQgZHJpdmVyVGFza1F1ZXVlTGVuZ3RoICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYWRkaW5nRHJpdmVyVGFza3NDb3VudCA/IHByb21pc2lmeUV2ZW50KHRoaXMsIEFMTF9EUklWRVJfVEFTS1NfQURERURfVE9fUVVFVUVfRVZFTlQpIDogUHJvbWlzZS5yZXNvbHZlKHRoaXMuZHJpdmVyVGFza1F1ZXVlLmxlbmd0aCk7XG4gICAgfVxuXG4gICAgYXN5bmMgX2VucXVldWVCcm93c2VyQ29uc29sZU1lc3NhZ2VzQ29tbWFuZCAoY29tbWFuZCwgY2FsbHNpdGUpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5fZW5xdWV1ZUNvbW1hbmQoY29tbWFuZCwgY2FsbHNpdGUpO1xuXG4gICAgICAgIHJldHVybiB0aGlzLmNvbnNvbGVNZXNzYWdlcy5nZXRDb3B5KCk7XG4gICAgfVxuXG4gICAgYXN5bmMgX2VucXVldWVTZXRCcmVha3BvaW50Q29tbWFuZCAoY2FsbHNpdGUsIGVycm9yKSB7XG4gICAgICAgIGlmICh0aGlzLmJyb3dzZXJDb25uZWN0aW9uLmlzSGVhZGxlc3NCcm93c2VyKCkpIHtcbiAgICAgICAgICAgIHRoaXMud2FybmluZ0xvZy5hZGRXYXJuaW5nKFdBUk5JTkdfTUVTU0FHRS5kZWJ1Z0luSGVhZGxlc3NFcnJvcik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBkZWJ1Z0xvZ2dlci5zaG93QnJlYWtwb2ludCh0aGlzLnNlc3Npb24uaWQsIHRoaXMuYnJvd3NlckNvbm5lY3Rpb24udXNlckFnZW50LCBjYWxsc2l0ZSwgZXJyb3IpO1xuXG4gICAgICAgIHRoaXMuZGVidWdnaW5nID0gYXdhaXQgdGhpcy5leGVjdXRlQ29tbWFuZChuZXcgc2VydmljZUNvbW1hbmRzLlNldEJyZWFrcG9pbnRDb21tYW5kKCEhZXJyb3IpLCBjYWxsc2l0ZSk7XG4gICAgfVxuXG4gICAgX3JlbW92ZUFsbE5vblNlcnZpY2VUYXNrcyAoKSB7XG4gICAgICAgIHRoaXMuZHJpdmVyVGFza1F1ZXVlID0gdGhpcy5kcml2ZXJUYXNrUXVldWUuZmlsdGVyKGRyaXZlclRhc2sgPT4gaXNTZXJ2aWNlQ29tbWFuZChkcml2ZXJUYXNrLmNvbW1hbmQpKTtcblxuICAgICAgICB0aGlzLmJyb3dzZXJNYW5pcHVsYXRpb25RdWV1ZS5yZW1vdmVBbGxOb25TZXJ2aWNlTWFuaXB1bGF0aW9ucygpO1xuICAgIH1cblxuICAgIC8vIEN1cnJlbnQgZHJpdmVyIHRhc2tcbiAgICBnZXQgY3VycmVudERyaXZlclRhc2sgKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5kcml2ZXJUYXNrUXVldWVbMF07XG4gICAgfVxuXG4gICAgX3Jlc29sdmVDdXJyZW50RHJpdmVyVGFzayAocmVzdWx0KSB7XG4gICAgICAgIHRoaXMuY3VycmVudERyaXZlclRhc2sucmVzb2x2ZShyZXN1bHQpO1xuICAgICAgICB0aGlzLmRyaXZlclRhc2tRdWV1ZS5zaGlmdCgpO1xuXG4gICAgICAgIGlmICh0aGlzLnRlc3REb25lQ29tbWFuZFF1ZXVlZClcbiAgICAgICAgICAgIHRoaXMuX3JlbW92ZUFsbE5vblNlcnZpY2VUYXNrcygpO1xuICAgIH1cblxuICAgIF9yZWplY3RDdXJyZW50RHJpdmVyVGFzayAoZXJyKSB7XG4gICAgICAgIGVyci5jYWxsc2l0ZSAgICAgICAgICAgICA9IGVyci5jYWxsc2l0ZSB8fCB0aGlzLmN1cnJlbnREcml2ZXJUYXNrLmNhbGxzaXRlO1xuICAgICAgICBlcnIuaXNSZWplY3RlZERyaXZlclRhc2sgPSB0cnVlO1xuXG4gICAgICAgIHRoaXMuY3VycmVudERyaXZlclRhc2sucmVqZWN0KGVycik7XG4gICAgICAgIHRoaXMuX3JlbW92ZUFsbE5vblNlcnZpY2VUYXNrcygpO1xuICAgIH1cblxuICAgIC8vIFBlbmRpbmcgcmVxdWVzdFxuICAgIF9jbGVhclBlbmRpbmdSZXF1ZXN0ICgpIHtcbiAgICAgICAgaWYgKHRoaXMucGVuZGluZ1JlcXVlc3QpIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLnBlbmRpbmdSZXF1ZXN0LnJlc3BvbnNlVGltZW91dCk7XG4gICAgICAgICAgICB0aGlzLnBlbmRpbmdSZXF1ZXN0ID0gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIF9yZXNvbHZlUGVuZGluZ1JlcXVlc3QgKGNvbW1hbmQpIHtcbiAgICAgICAgdGhpcy5sYXN0RHJpdmVyU3RhdHVzUmVzcG9uc2UgPSBjb21tYW5kO1xuICAgICAgICB0aGlzLnBlbmRpbmdSZXF1ZXN0LnJlc29sdmUoY29tbWFuZCk7XG4gICAgICAgIHRoaXMuX2NsZWFyUGVuZGluZ1JlcXVlc3QoKTtcbiAgICB9XG5cbiAgICAvLyBIYW5kbGUgZHJpdmVyIHJlcXVlc3RcbiAgICBfZnVsZmlsbEN1cnJlbnREcml2ZXJUYXNrIChkcml2ZXJTdGF0dXMpIHtcbiAgICAgICAgaWYgKGRyaXZlclN0YXR1cy5leGVjdXRpb25FcnJvcilcbiAgICAgICAgICAgIHRoaXMuX3JlamVjdEN1cnJlbnREcml2ZXJUYXNrKGRyaXZlclN0YXR1cy5leGVjdXRpb25FcnJvcik7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHRoaXMuX3Jlc29sdmVDdXJyZW50RHJpdmVyVGFzayhkcml2ZXJTdGF0dXMucmVzdWx0KTtcbiAgICB9XG5cbiAgICBfaGFuZGxlUGFnZUVycm9yU3RhdHVzIChwYWdlRXJyb3IpIHtcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudERyaXZlclRhc2sgJiYgaXNDb21tYW5kUmVqZWN0YWJsZUJ5UGFnZUVycm9yKHRoaXMuY3VycmVudERyaXZlclRhc2suY29tbWFuZCkpIHtcbiAgICAgICAgICAgIHRoaXMuX3JlamVjdEN1cnJlbnREcml2ZXJUYXNrKHBhZ2VFcnJvcik7XG4gICAgICAgICAgICB0aGlzLnBlbmRpbmdQYWdlRXJyb3IgPSBudWxsO1xuXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMucGVuZGluZ1BhZ2VFcnJvciA9IHRoaXMucGVuZGluZ1BhZ2VFcnJvciB8fCBwYWdlRXJyb3I7XG5cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIF9oYW5kbGVEcml2ZXJSZXF1ZXN0IChkcml2ZXJTdGF0dXMpIHtcbiAgICAgICAgY29uc3QgaXNUZXN0RG9uZSAgICAgICAgICAgICAgICAgPSB0aGlzLmN1cnJlbnREcml2ZXJUYXNrICYmIHRoaXMuY3VycmVudERyaXZlclRhc2suY29tbWFuZC50eXBlID09PSBDT01NQU5EX1RZUEUudGVzdERvbmU7XG4gICAgICAgIGNvbnN0IHBhZ2VFcnJvciAgICAgICAgICAgICAgICAgID0gdGhpcy5wZW5kaW5nUGFnZUVycm9yIHx8IGRyaXZlclN0YXR1cy5wYWdlRXJyb3I7XG4gICAgICAgIGNvbnN0IGN1cnJlbnRUYXNrUmVqZWN0ZWRCeUVycm9yID0gcGFnZUVycm9yICYmIHRoaXMuX2hhbmRsZVBhZ2VFcnJvclN0YXR1cyhwYWdlRXJyb3IpO1xuXG4gICAgICAgIGlmICh0aGlzLmRpc2Nvbm5lY3RlZClcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgoXywgcmVqZWN0KSA9PiByZWplY3QoKSk7XG5cbiAgICAgICAgdGhpcy5jb25zb2xlTWVzc2FnZXMuY29uY2F0KGRyaXZlclN0YXR1cy5jb25zb2xlTWVzc2FnZXMpO1xuXG4gICAgICAgIGlmICghY3VycmVudFRhc2tSZWplY3RlZEJ5RXJyb3IgJiYgZHJpdmVyU3RhdHVzLmlzQ29tbWFuZFJlc3VsdCkge1xuICAgICAgICAgICAgaWYgKGlzVGVzdERvbmUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9yZXNvbHZlQ3VycmVudERyaXZlclRhc2soKTtcblxuICAgICAgICAgICAgICAgIHJldHVybiBURVNUX0RPTkVfQ09ORklSTUFUSU9OX1JFU1BPTlNFO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLl9mdWxmaWxsQ3VycmVudERyaXZlclRhc2soZHJpdmVyU3RhdHVzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzLl9nZXRDdXJyZW50RHJpdmVyVGFza0NvbW1hbmQoKTtcbiAgICB9XG5cbiAgICBfZ2V0Q3VycmVudERyaXZlclRhc2tDb21tYW5kICgpIHtcbiAgICAgICAgaWYgKCF0aGlzLmN1cnJlbnREcml2ZXJUYXNrKVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgY29uc3QgY29tbWFuZCA9IHRoaXMuY3VycmVudERyaXZlclRhc2suY29tbWFuZDtcblxuICAgICAgICBpZiAoY29tbWFuZC50eXBlID09PSBDT01NQU5EX1RZUEUubmF2aWdhdGVUbyAmJiBjb21tYW5kLnN0YXRlU25hcHNob3QpXG4gICAgICAgICAgICB0aGlzLnNlc3Npb24udXNlU3RhdGVTbmFwc2hvdChKU09OLnBhcnNlKGNvbW1hbmQuc3RhdGVTbmFwc2hvdCkpO1xuXG4gICAgICAgIHJldHVybiBjb21tYW5kO1xuICAgIH1cblxuICAgIC8vIEV4ZWN1dGUgY29tbWFuZFxuICAgIGFzeW5jIF9leGVjdXRlRXhwcmVzc2lvbiAoY29tbWFuZCkge1xuICAgICAgICBjb25zdCB7IHJlc3VsdFZhcmlhYmxlTmFtZSwgaXNBc3luY0V4cHJlc3Npb24gfSA9IGNvbW1hbmQ7XG5cbiAgICAgICAgbGV0IGV4cHJlc3Npb24gPSBjb21tYW5kLmV4cHJlc3Npb247XG5cbiAgICAgICAgaWYgKGlzQXN5bmNFeHByZXNzaW9uKVxuICAgICAgICAgICAgZXhwcmVzc2lvbiA9IGBhd2FpdCAke2V4cHJlc3Npb259YDtcblxuICAgICAgICBpZiAocmVzdWx0VmFyaWFibGVOYW1lKVxuICAgICAgICAgICAgZXhwcmVzc2lvbiA9IGAke3Jlc3VsdFZhcmlhYmxlTmFtZX0gPSAke2V4cHJlc3Npb259LCAke3Jlc3VsdFZhcmlhYmxlTmFtZX1gO1xuXG4gICAgICAgIGlmIChpc0FzeW5jRXhwcmVzc2lvbilcbiAgICAgICAgICAgIGV4cHJlc3Npb24gPSBgKGFzeW5jICgpID0+IHsgcmV0dXJuICR7ZXhwcmVzc2lvbn07IH0pLmFwcGx5KHRoaXMpO2A7XG5cbiAgICAgICAgY29uc3QgcmVzdWx0ID0gdGhpcy5fZXZhbHVhdGUoZXhwcmVzc2lvbik7XG5cbiAgICAgICAgcmV0dXJuIGlzQXN5bmNFeHByZXNzaW9uID8gYXdhaXQgcmVzdWx0IDogcmVzdWx0O1xuICAgIH1cblxuICAgIGFzeW5jIF9leGVjdXRlQXNzZXJ0aW9uIChjb21tYW5kLCBjYWxsc2l0ZSkge1xuICAgICAgICBjb25zdCBhc3NlcnRpb25UaW1lb3V0ID0gY29tbWFuZC5vcHRpb25zLnRpbWVvdXQgPT09IHZvaWQgMCA/IHRoaXMub3B0cy5hc3NlcnRpb25UaW1lb3V0IDogY29tbWFuZC5vcHRpb25zLnRpbWVvdXQ7XG4gICAgICAgIGNvbnN0IGV4ZWN1dG9yICAgICAgICAgPSBuZXcgQXNzZXJ0aW9uRXhlY3V0b3IoY29tbWFuZCwgYXNzZXJ0aW9uVGltZW91dCwgY2FsbHNpdGUpO1xuXG4gICAgICAgIGV4ZWN1dG9yLm9uY2UoJ3N0YXJ0LWFzc2VydGlvbi1yZXRyaWVzJywgdGltZW91dCA9PiB0aGlzLmV4ZWN1dGVDb21tYW5kKG5ldyBzZXJ2aWNlQ29tbWFuZHMuU2hvd0Fzc2VydGlvblJldHJpZXNTdGF0dXNDb21tYW5kKHRpbWVvdXQpKSk7XG4gICAgICAgIGV4ZWN1dG9yLm9uY2UoJ2VuZC1hc3NlcnRpb24tcmV0cmllcycsIHN1Y2Nlc3MgPT4gdGhpcy5leGVjdXRlQ29tbWFuZChuZXcgc2VydmljZUNvbW1hbmRzLkhpZGVBc3NlcnRpb25SZXRyaWVzU3RhdHVzQ29tbWFuZChzdWNjZXNzKSkpO1xuXG4gICAgICAgIHJldHVybiBleGVjdXRvci5ydW4oKTtcbiAgICB9XG5cbiAgICBfYWRqdXN0Q29uZmlndXJhdGlvbldpdGhDb21tYW5kIChjb21tYW5kKSB7XG4gICAgICAgIGlmIChjb21tYW5kLnR5cGUgPT09IENPTU1BTkRfVFlQRS50ZXN0RG9uZSkge1xuICAgICAgICAgICAgdGhpcy50ZXN0RG9uZUNvbW1hbmRRdWV1ZWQgPSB0cnVlO1xuICAgICAgICAgICAgZGVidWdMb2dnZXIuaGlkZUJyZWFrcG9pbnQodGhpcy5zZXNzaW9uLmlkKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGVsc2UgaWYgKGNvbW1hbmQudHlwZSA9PT0gQ09NTUFORF9UWVBFLnNldE5hdGl2ZURpYWxvZ0hhbmRsZXIpXG4gICAgICAgICAgICB0aGlzLmFjdGl2ZURpYWxvZ0hhbmRsZXIgPSBjb21tYW5kLmRpYWxvZ0hhbmRsZXI7XG5cbiAgICAgICAgZWxzZSBpZiAoY29tbWFuZC50eXBlID09PSBDT01NQU5EX1RZUEUuc3dpdGNoVG9JZnJhbWUpXG4gICAgICAgICAgICB0aGlzLmFjdGl2ZUlmcmFtZVNlbGVjdG9yID0gY29tbWFuZC5zZWxlY3RvcjtcblxuICAgICAgICBlbHNlIGlmIChjb21tYW5kLnR5cGUgPT09IENPTU1BTkRfVFlQRS5zd2l0Y2hUb01haW5XaW5kb3cpXG4gICAgICAgICAgICB0aGlzLmFjdGl2ZUlmcmFtZVNlbGVjdG9yID0gbnVsbDtcblxuICAgICAgICBlbHNlIGlmIChjb21tYW5kLnR5cGUgPT09IENPTU1BTkRfVFlQRS5zZXRUZXN0U3BlZWQpXG4gICAgICAgICAgICB0aGlzLnNwZWVkID0gY29tbWFuZC5zcGVlZDtcblxuICAgICAgICBlbHNlIGlmIChjb21tYW5kLnR5cGUgPT09IENPTU1BTkRfVFlQRS5zZXRQYWdlTG9hZFRpbWVvdXQpXG4gICAgICAgICAgICB0aGlzLnBhZ2VMb2FkVGltZW91dCA9IGNvbW1hbmQuZHVyYXRpb247XG5cbiAgICAgICAgZWxzZSBpZiAoY29tbWFuZC50eXBlID09PSBDT01NQU5EX1RZUEUuZGVidWcpXG4gICAgICAgICAgICB0aGlzLmRlYnVnZ2luZyA9IHRydWU7XG4gICAgfVxuXG4gICAgYXN5bmMgX2FkanVzdFNjcmVlbnNob3RDb21tYW5kIChjb21tYW5kKSB7XG4gICAgICAgIGNvbnN0IGJyb3dzZXJJZCAgICAgICAgICAgICAgICAgICAgPSB0aGlzLmJyb3dzZXJDb25uZWN0aW9uLmlkO1xuICAgICAgICBjb25zdCB7IGhhc0Nocm9tZWxlc3NTY3JlZW5zaG90cyB9ID0gYXdhaXQgdGhpcy5icm93c2VyQ29ubmVjdGlvbi5wcm92aWRlci5oYXNDdXN0b21BY3Rpb25Gb3JCcm93c2VyKGJyb3dzZXJJZCk7XG5cbiAgICAgICAgaWYgKCFoYXNDaHJvbWVsZXNzU2NyZWVuc2hvdHMpXG4gICAgICAgICAgICBjb21tYW5kLmdlbmVyYXRlU2NyZWVuc2hvdE1hcmsoKTtcbiAgICB9XG5cbiAgICBhc3luYyBfc2V0QnJlYWtwb2ludElmTmVjZXNzYXJ5IChjb21tYW5kLCBjYWxsc2l0ZSkge1xuICAgICAgICBpZiAoIXRoaXMuZGlzYWJsZURlYnVnQnJlYWtwb2ludHMgJiYgdGhpcy5kZWJ1Z2dpbmcgJiYgY2FuU2V0RGVidWdnZXJCcmVha3BvaW50QmVmb3JlQ29tbWFuZChjb21tYW5kKSlcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuX2VucXVldWVTZXRCcmVha3BvaW50Q29tbWFuZChjYWxsc2l0ZSk7XG4gICAgfVxuXG4gICAgYXN5bmMgZXhlY3V0ZUNvbW1hbmQgKGNvbW1hbmQsIGNhbGxzaXRlKSB7XG4gICAgICAgIHRoaXMuZGVidWdMb2cuY29tbWFuZChjb21tYW5kKTtcblxuICAgICAgICBpZiAodGhpcy5wZW5kaW5nUGFnZUVycm9yICYmIGlzQ29tbWFuZFJlamVjdGFibGVCeVBhZ2VFcnJvcihjb21tYW5kKSlcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9yZWplY3RDb21tYW5kV2l0aFBhZ2VFcnJvcihjYWxsc2l0ZSk7XG5cbiAgICAgICAgaWYgKGlzRXhlY3V0YWJsZU9uQ2xpZW50Q29tbWFuZChjb21tYW5kKSlcbiAgICAgICAgICAgIHRoaXMuYWRkaW5nRHJpdmVyVGFza3NDb3VudCsrO1xuXG4gICAgICAgIHRoaXMuX2FkanVzdENvbmZpZ3VyYXRpb25XaXRoQ29tbWFuZChjb21tYW5kKTtcblxuICAgICAgICBhd2FpdCB0aGlzLl9zZXRCcmVha3BvaW50SWZOZWNlc3NhcnkoY29tbWFuZCwgY2FsbHNpdGUpO1xuXG4gICAgICAgIGlmIChpc1NjcmVlbnNob3RDb21tYW5kKGNvbW1hbmQpKVxuICAgICAgICAgICAgYXdhaXQgdGhpcy5fYWRqdXN0U2NyZWVuc2hvdENvbW1hbmQoY29tbWFuZCk7XG5cbiAgICAgICAgaWYgKGlzQnJvd3Nlck1hbmlwdWxhdGlvbkNvbW1hbmQoY29tbWFuZCkpXG4gICAgICAgICAgICB0aGlzLmJyb3dzZXJNYW5pcHVsYXRpb25RdWV1ZS5wdXNoKGNvbW1hbmQpO1xuXG4gICAgICAgIGlmIChjb21tYW5kLnR5cGUgPT09IENPTU1BTkRfVFlQRS53YWl0KVxuICAgICAgICAgICAgcmV0dXJuIGRlbGF5KGNvbW1hbmQudGltZW91dCk7XG5cbiAgICAgICAgaWYgKGNvbW1hbmQudHlwZSA9PT0gQ09NTUFORF9UWVBFLnNldFBhZ2VMb2FkVGltZW91dClcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuXG4gICAgICAgIGlmIChjb21tYW5kLnR5cGUgPT09IENPTU1BTkRfVFlQRS5kZWJ1ZylcbiAgICAgICAgICAgIHJldHVybiBhd2FpdCB0aGlzLl9lbnF1ZXVlU2V0QnJlYWtwb2ludENvbW1hbmQoY2FsbHNpdGUpO1xuXG4gICAgICAgIGlmIChjb21tYW5kLnR5cGUgPT09IENPTU1BTkRfVFlQRS51c2VSb2xlKVxuICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuX3VzZVJvbGUoY29tbWFuZC5yb2xlLCBjYWxsc2l0ZSk7XG5cbiAgICAgICAgaWYgKGNvbW1hbmQudHlwZSA9PT0gQ09NTUFORF9UWVBFLmFzc2VydGlvbilcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9leGVjdXRlQXNzZXJ0aW9uKGNvbW1hbmQsIGNhbGxzaXRlKTtcblxuICAgICAgICBpZiAoY29tbWFuZC50eXBlID09PSBDT01NQU5EX1RZUEUuZXhlY3V0ZUV4cHJlc3Npb24pXG4gICAgICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5fZXhlY3V0ZUV4cHJlc3Npb24oY29tbWFuZCwgY2FsbHNpdGUpO1xuXG4gICAgICAgIGlmIChjb21tYW5kLnR5cGUgPT09IENPTU1BTkRfVFlQRS5nZXRCcm93c2VyQ29uc29sZU1lc3NhZ2VzKVxuICAgICAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuX2VucXVldWVCcm93c2VyQ29uc29sZU1lc3NhZ2VzQ29tbWFuZChjb21tYW5kLCBjYWxsc2l0ZSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuX2VucXVldWVDb21tYW5kKGNvbW1hbmQsIGNhbGxzaXRlKTtcbiAgICB9XG5cbiAgICBfcmVqZWN0Q29tbWFuZFdpdGhQYWdlRXJyb3IgKGNhbGxzaXRlKSB7XG4gICAgICAgIGNvbnN0IGVyciA9IHRoaXMucGVuZGluZ1BhZ2VFcnJvcjtcblxuICAgICAgICBlcnIuY2FsbHNpdGUgICAgICAgICAgPSBjYWxsc2l0ZTtcbiAgICAgICAgdGhpcy5wZW5kaW5nUGFnZUVycm9yID0gbnVsbDtcblxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyKTtcbiAgICB9XG5cbiAgICAvLyBSb2xlIG1hbmFnZW1lbnRcbiAgICBhc3luYyBnZXRTdGF0ZVNuYXBzaG90ICgpIHtcbiAgICAgICAgY29uc3Qgc3RhdGUgPSB0aGlzLnNlc3Npb24uZ2V0U3RhdGVTbmFwc2hvdCgpO1xuXG4gICAgICAgIHN0YXRlLnN0b3JhZ2VzID0gYXdhaXQgdGhpcy5leGVjdXRlQ29tbWFuZChuZXcgc2VydmljZUNvbW1hbmRzLkJhY2t1cFN0b3JhZ2VzQ29tbWFuZCgpKTtcblxuICAgICAgICByZXR1cm4gc3RhdGU7XG4gICAgfVxuXG4gICAgYXN5bmMgc3dpdGNoVG9DbGVhblJ1biAoKSB7XG4gICAgICAgIHRoaXMuY3R4ICAgICAgICAgICAgID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICAgICAgdGhpcy5maXh0dXJlQ3R4ICAgICAgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgICAgICB0aGlzLmNvbnNvbGVNZXNzYWdlcyA9IG5ldyBCcm93c2VyQ29uc29sZU1lc3NhZ2VzKCk7XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnVzZVN0YXRlU25hcHNob3QobnVsbCk7XG5cbiAgICAgICAgaWYgKHRoaXMuYWN0aXZlRGlhbG9nSGFuZGxlcikge1xuICAgICAgICAgICAgY29uc3QgcmVtb3ZlRGlhbG9nSGFuZGxlckNvbW1hbmQgPSBuZXcgYWN0aW9uQ29tbWFuZHMuU2V0TmF0aXZlRGlhbG9nSGFuZGxlckNvbW1hbmQoeyBkaWFsb2dIYW5kbGVyOiB7IGZuOiBudWxsIH0gfSk7XG5cbiAgICAgICAgICAgIGF3YWl0IHRoaXMuZXhlY3V0ZUNvbW1hbmQocmVtb3ZlRGlhbG9nSGFuZGxlckNvbW1hbmQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuc3BlZWQgIT09IHRoaXMub3B0cy5zcGVlZCkge1xuICAgICAgICAgICAgY29uc3Qgc2V0U3BlZWRDb21tYW5kID0gbmV3IGFjdGlvbkNvbW1hbmRzLlNldFRlc3RTcGVlZENvbW1hbmQoeyBzcGVlZDogdGhpcy5vcHRzLnNwZWVkIH0pO1xuXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmV4ZWN1dGVDb21tYW5kKHNldFNwZWVkQ29tbWFuZCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5wYWdlTG9hZFRpbWVvdXQgIT09IHRoaXMub3B0cy5wYWdlTG9hZFRpbWVvdXQpIHtcbiAgICAgICAgICAgIGNvbnN0IHNldFBhZ2VMb2FkVGltZW91dENvbW1hbmQgPSBuZXcgYWN0aW9uQ29tbWFuZHMuU2V0UGFnZUxvYWRUaW1lb3V0Q29tbWFuZCh7IGR1cmF0aW9uOiB0aGlzLm9wdHMucGFnZUxvYWRUaW1lb3V0IH0pO1xuXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmV4ZWN1dGVDb21tYW5kKHNldFBhZ2VMb2FkVGltZW91dENvbW1hbmQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgYXN5bmMgX2dldFN0YXRlU25hcHNob3RGcm9tUm9sZSAocm9sZSkge1xuICAgICAgICBjb25zdCBwcmV2UGhhc2UgPSB0aGlzLnBoYXNlO1xuXG4gICAgICAgIHRoaXMucGhhc2UgPSBQSEFTRS5pblJvbGVJbml0aWFsaXplcjtcblxuICAgICAgICBpZiAocm9sZS5waGFzZSA9PT0gUk9MRV9QSEFTRS51bmluaXRpYWxpemVkKVxuICAgICAgICAgICAgYXdhaXQgcm9sZS5pbml0aWFsaXplKHRoaXMpO1xuXG4gICAgICAgIGVsc2UgaWYgKHJvbGUucGhhc2UgPT09IFJPTEVfUEhBU0UucGVuZGluZ0luaXRpYWxpemF0aW9uKVxuICAgICAgICAgICAgYXdhaXQgcHJvbWlzaWZ5RXZlbnQocm9sZSwgJ2luaXRpYWxpemVkJyk7XG5cbiAgICAgICAgaWYgKHJvbGUuaW5pdEVycilcbiAgICAgICAgICAgIHRocm93IHJvbGUuaW5pdEVycjtcblxuICAgICAgICB0aGlzLnBoYXNlID0gcHJldlBoYXNlO1xuXG4gICAgICAgIHJldHVybiByb2xlLnN0YXRlU25hcHNob3Q7XG4gICAgfVxuXG4gICAgYXN5bmMgX3VzZVJvbGUgKHJvbGUsIGNhbGxzaXRlKSB7XG4gICAgICAgIGlmICh0aGlzLnBoYXNlID09PSBQSEFTRS5pblJvbGVJbml0aWFsaXplcilcbiAgICAgICAgICAgIHRocm93IG5ldyBSb2xlU3dpdGNoSW5Sb2xlSW5pdGlhbGl6ZXJFcnJvcihjYWxsc2l0ZSk7XG5cbiAgICAgICAgdGhpcy5kaXNhYmxlRGVidWdCcmVha3BvaW50cyA9IHRydWU7XG5cbiAgICAgICAgY29uc3QgYm9va21hcmsgPSBuZXcgVGVzdFJ1bkJvb2ttYXJrKHRoaXMsIHJvbGUpO1xuXG4gICAgICAgIGF3YWl0IGJvb2ttYXJrLmluaXQoKTtcblxuICAgICAgICBpZiAodGhpcy5jdXJyZW50Um9sZUlkKVxuICAgICAgICAgICAgdGhpcy51c2VkUm9sZVN0YXRlc1t0aGlzLmN1cnJlbnRSb2xlSWRdID0gYXdhaXQgdGhpcy5nZXRTdGF0ZVNuYXBzaG90KCk7XG5cbiAgICAgICAgY29uc3Qgc3RhdGVTbmFwc2hvdCA9IHRoaXMudXNlZFJvbGVTdGF0ZXNbcm9sZS5pZF0gfHwgYXdhaXQgdGhpcy5fZ2V0U3RhdGVTbmFwc2hvdEZyb21Sb2xlKHJvbGUpO1xuXG4gICAgICAgIHRoaXMuc2Vzc2lvbi51c2VTdGF0ZVNuYXBzaG90KHN0YXRlU25hcHNob3QpO1xuXG4gICAgICAgIHRoaXMuY3VycmVudFJvbGVJZCA9IHJvbGUuaWQ7XG5cbiAgICAgICAgYXdhaXQgYm9va21hcmsucmVzdG9yZShjYWxsc2l0ZSwgc3RhdGVTbmFwc2hvdCk7XG5cbiAgICAgICAgdGhpcy5kaXNhYmxlRGVidWdCcmVha3BvaW50cyA9IGZhbHNlO1xuICAgIH1cblxuICAgIC8vIEdldCBjdXJyZW50IFVSTFxuICAgIGFzeW5jIGdldEN1cnJlbnRVcmwgKCkge1xuICAgICAgICBjb25zdCBidWlsZGVyID0gbmV3IENsaWVudEZ1bmN0aW9uQnVpbGRlcigoKSA9PiB7XG4gICAgICAgICAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby11bmRlZiAqL1xuICAgICAgICAgICAgcmV0dXJuIHdpbmRvdy5sb2NhdGlvbi5ocmVmO1xuICAgICAgICAgICAgLyogZXNsaW50LWVuYWJsZSBuby11bmRlZiAqL1xuICAgICAgICB9LCB7IGJvdW5kVGVzdFJ1bjogdGhpcyB9KTtcblxuICAgICAgICBjb25zdCBnZXRMb2NhdGlvbiA9IGJ1aWxkZXIuZ2V0RnVuY3Rpb24oKTtcblxuICAgICAgICByZXR1cm4gYXdhaXQgZ2V0TG9jYXRpb24oKTtcbiAgICB9XG5cbiAgICBfZGlzY29ubmVjdCAoZXJyKSB7XG4gICAgICAgIHRoaXMuZGlzY29ubmVjdGVkID0gdHJ1ZTtcblxuICAgICAgICB0aGlzLl9yZWplY3RDdXJyZW50RHJpdmVyVGFzayhlcnIpO1xuXG4gICAgICAgIHRoaXMuZW1pdCgnZGlzY29ubmVjdGVkJywgZXJyKTtcblxuICAgICAgICBkZWxldGUgdGVzdFJ1blRyYWNrZXIuYWN0aXZlVGVzdFJ1bnNbdGhpcy5zZXNzaW9uLmlkXTtcbiAgICB9XG59XG5cbi8vIFNlcnZpY2UgbWVzc2FnZSBoYW5kbGVyc1xuY29uc3QgU2VydmljZU1lc3NhZ2VzID0gVGVzdFJ1bi5wcm90b3R5cGU7XG5cblNlcnZpY2VNZXNzYWdlc1tDTElFTlRfTUVTU0FHRVMucmVhZHldID0gZnVuY3Rpb24gKG1zZykge1xuICAgIHRoaXMuZGVidWdMb2cuZHJpdmVyTWVzc2FnZShtc2cpO1xuXG4gICAgdGhpcy5fY2xlYXJQZW5kaW5nUmVxdWVzdCgpO1xuXG4gICAgLy8gTk9URTogdGhlIGRyaXZlciBzZW5kcyB0aGUgc3RhdHVzIGZvciB0aGUgc2Vjb25kIHRpbWUgaWYgaXQgZGlkbid0IGdldCBhIHJlc3BvbnNlIGF0IHRoZVxuICAgIC8vIGZpcnN0IHRyeS4gVGhpcyBpcyBwb3NzaWJsZSB3aGVuIHRoZSBwYWdlIHdhcyB1bmxvYWRlZCBhZnRlciB0aGUgZHJpdmVyIHNlbnQgdGhlIHN0YXR1cy5cbiAgICBpZiAobXNnLnN0YXR1cy5pZCA9PT0gdGhpcy5sYXN0RHJpdmVyU3RhdHVzSWQpXG4gICAgICAgIHJldHVybiB0aGlzLmxhc3REcml2ZXJTdGF0dXNSZXNwb25zZTtcblxuICAgIHRoaXMubGFzdERyaXZlclN0YXR1c0lkICAgICAgID0gbXNnLnN0YXR1cy5pZDtcbiAgICB0aGlzLmxhc3REcml2ZXJTdGF0dXNSZXNwb25zZSA9IHRoaXMuX2hhbmRsZURyaXZlclJlcXVlc3QobXNnLnN0YXR1cyk7XG5cbiAgICBpZiAodGhpcy5sYXN0RHJpdmVyU3RhdHVzUmVzcG9uc2UpXG4gICAgICAgIHJldHVybiB0aGlzLmxhc3REcml2ZXJTdGF0dXNSZXNwb25zZTtcblxuICAgIC8vIE5PVEU6IHdlIHNlbmQgYW4gZW1wdHkgcmVzcG9uc2UgYWZ0ZXIgdGhlIE1BWF9SRVNQT05TRV9ERUxBWSB0aW1lb3V0IGlzIGV4Y2VlZGVkIHRvIGtlZXAgY29ubmVjdGlvblxuICAgIC8vIHdpdGggdGhlIGNsaWVudCBhbmQgcHJldmVudCB0aGUgcmVzcG9uc2UgdGltZW91dCBleGNlcHRpb24gb24gdGhlIGNsaWVudCBzaWRlXG4gICAgY29uc3QgcmVzcG9uc2VUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB0aGlzLl9yZXNvbHZlUGVuZGluZ1JlcXVlc3QobnVsbCksIE1BWF9SRVNQT05TRV9ERUxBWSk7XG5cbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICB0aGlzLnBlbmRpbmdSZXF1ZXN0ID0geyByZXNvbHZlLCByZWplY3QsIHJlc3BvbnNlVGltZW91dCB9O1xuICAgIH0pO1xufTtcblxuU2VydmljZU1lc3NhZ2VzW0NMSUVOVF9NRVNTQUdFUy5yZWFkeUZvckJyb3dzZXJNYW5pcHVsYXRpb25dID0gYXN5bmMgZnVuY3Rpb24gKG1zZykge1xuICAgIHRoaXMuZGVidWdMb2cuZHJpdmVyTWVzc2FnZShtc2cpO1xuXG4gICAgbGV0IHJlc3VsdCA9IG51bGw7XG4gICAgbGV0IGVycm9yICA9IG51bGw7XG5cbiAgICB0cnkge1xuICAgICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmJyb3dzZXJNYW5pcHVsYXRpb25RdWV1ZS5leGVjdXRlUGVuZGluZ01hbmlwdWxhdGlvbihtc2cpO1xuICAgIH1cbiAgICBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGVycm9yID0gZXJyO1xuICAgIH1cblxuICAgIHJldHVybiB7IHJlc3VsdCwgZXJyb3IgfTtcbn07XG5cblNlcnZpY2VNZXNzYWdlc1tDTElFTlRfTUVTU0FHRVMud2FpdEZvckZpbGVEb3dubG9hZF0gPSBmdW5jdGlvbiAobXNnKSB7XG4gICAgdGhpcy5kZWJ1Z0xvZy5kcml2ZXJNZXNzYWdlKG1zZyk7XG5cbiAgICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICAgIGlmICh0aGlzLmZpbGVEb3dubG9hZGluZ0hhbmRsZWQpIHtcbiAgICAgICAgICAgIHRoaXMuZmlsZURvd25sb2FkaW5nSGFuZGxlZCA9IGZhbHNlO1xuICAgICAgICAgICAgcmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aGlzLnJlc29sdmVXYWl0Rm9yRmlsZURvd25sb2FkaW5nUHJvbWlzZSA9IHJlc29sdmU7XG4gICAgfSk7XG59O1xuIl19
