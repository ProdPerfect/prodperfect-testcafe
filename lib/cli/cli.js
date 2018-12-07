'use strict';

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

let runTests = (() => {
    var _ref = (0, _asyncToGenerator3.default)(function* (argParser) {
        const opts = argParser.opts;
        const port1 = opts.ports && opts.ports[0];
        const port2 = opts.ports && opts.ports[1];
        const externalProxyHost = opts.proxy;
        const proxyBypass = opts.proxyBypass;

        _log2.default.showSpinner();

        const testCafe = yield (0, _2.default)(opts.hostname, port1, port2, opts.ssl, opts.dev);
        const concurrency = argParser.concurrency || 1;
        const remoteBrowsers = yield (0, _remotesWizard2.default)(testCafe, argParser.remoteCount, opts.qrCode);
        const browsers = argParser.browsers.concat(remoteBrowsers);
        const runner = testCafe.createRunner();
        let failed = 0;
        const reporters = argParser.opts.reporters.map(function (r) {
            return {
                name: r.name,
                outStream: r.outFile ? _fs2.default.createWriteStream(r.outFile) : void 0
            };
        });

        reporters.forEach(function (r) {
            return runner.reporter(r.name, r.outStream);
        });

        runner.useProxy(externalProxyHost, proxyBypass).src(argParser.src).browsers(browsers).concurrency(concurrency).filter(argParser.filter).screenshots(opts.screenshots, opts.screenshotsOnFails, opts.screenshotPathPattern, opts.recordScreenCapture).startApp(opts.app, opts.appInitDelay);

        runner.once('done-bootstrapping', function () {
            return _log2.default.hideSpinner();
        });

        try {
            failed = yield runner.run(opts);
        } finally {
            showMessageOnExit = false;
            yield testCafe.close();
        }

        exit(failed);
    });

    return function runTests(_x) {
        return _ref.apply(this, arguments);
    };
})();

let listBrowsers = (() => {
    var _ref2 = (0, _asyncToGenerator3.default)(function* (providerName = 'locally-installed') {
        // NOTE: Load the provider pool lazily to reduce startup time
        const browserProviderPool = require('../browser/provider/pool');

        const provider = yield browserProviderPool.getProvider(providerName);

        if (!provider) throw new _runtime.GeneralError(_message2.default.browserProviderNotFound, providerName);

        if (provider.isMultiBrowser) {
            const browserNames = yield provider.getBrowserList();

            yield browserProviderPool.dispose();

            if (providerName === 'locally-installed') console.log(browserNames.join('\n'));else console.log(browserNames.map(function (browserName) {
                return `"${providerName}:${browserName}"`;
            }).join('\n'));
        } else console.log(`"${providerName}"`);

        exit(0);
    });

    return function listBrowsers() {
        return _ref2.apply(this, arguments);
    };
})();

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _chalk = require('chalk');

var _chalk2 = _interopRequireDefault(_chalk);

var _runtime = require('../errors/runtime');

var _message = require('../errors/runtime/message');

var _message2 = _interopRequireDefault(_message);

var _argumentParser = require('./argument-parser');

var _argumentParser2 = _interopRequireDefault(_argumentParser);

var _terminationHandler = require('./termination-handler');

var _terminationHandler2 = _interopRequireDefault(_terminationHandler);

var _log = require('./log');

var _log2 = _interopRequireDefault(_log);

var _remotesWizard = require('./remotes-wizard');

var _remotesWizard2 = _interopRequireDefault(_remotesWizard);

var _ = require('../');

var _2 = _interopRequireDefault(_);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

let showMessageOnExit = true;
let exitMessageShown = false;
let exiting = false;

function exitHandler(terminationLevel) {
    if (showMessageOnExit && !exitMessageShown) {
        exitMessageShown = true;

        _log2.default.hideSpinner();
        _log2.default.write('Stopping TestCafe...');
        _log2.default.showSpinner();

        process.on('exit', () => _log2.default.hideSpinner(true));
    }

    if (exiting || terminationLevel < 2) return;

    exiting = true;

    exit(0);
}

function exit(code) {
    _log2.default.hideSpinner(true);

    // NOTE: give a process time to flush the output.
    // It's necessary in some environments.
    setTimeout(() => process.exit(code), 0);
}

function error(err) {
    _log2.default.hideSpinner();

    let message = null;

    // HACK: workaround for the `instanceof` problem
    // (see: http://stackoverflow.com/questions/33870684/why-doesnt-instanceof-work-on-instances-of-error-subclasses-under-babel-node)
    if (err.constructor === _runtime.GeneralError) message = err.message;else if (err.constructor === _runtime.APIError) message = err.coloredStack;else message = err.stack;

    _log2.default.write(_chalk2.default.red('ERROR ') + message + '\n');
    _log2.default.write(_chalk2.default.gray('Type "testcafe -h" for help.'));

    exit(1);
}

(() => {
    var _ref3 = (0, _asyncToGenerator3.default)(function* () {
        const terminationHandler = new _terminationHandler2.default();

        terminationHandler.on(_terminationHandler2.default.TERMINATION_LEVEL_INCREASED_EVENT, exitHandler);

        try {
            const argParser = new _argumentParser2.default();

            yield argParser.parse(process.argv);

            if (argParser.opts.listBrowsers) yield listBrowsers(argParser.opts.providerName);else yield runTests(argParser);
        } catch (err) {
            showMessageOnExit = false;
            error(err);
        }
    });

    function cli() {
        return _ref3.apply(this, arguments);
    }

    return cli;
})()();
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9jbGkvY2xpLmpzIl0sIm5hbWVzIjpbImFyZ1BhcnNlciIsIm9wdHMiLCJwb3J0MSIsInBvcnRzIiwicG9ydDIiLCJleHRlcm5hbFByb3h5SG9zdCIsInByb3h5IiwicHJveHlCeXBhc3MiLCJsb2ciLCJzaG93U3Bpbm5lciIsInRlc3RDYWZlIiwiaG9zdG5hbWUiLCJzc2wiLCJkZXYiLCJjb25jdXJyZW5jeSIsInJlbW90ZUJyb3dzZXJzIiwicmVtb3RlQ291bnQiLCJxckNvZGUiLCJicm93c2VycyIsImNvbmNhdCIsInJ1bm5lciIsImNyZWF0ZVJ1bm5lciIsImZhaWxlZCIsInJlcG9ydGVycyIsIm1hcCIsIm5hbWUiLCJyIiwib3V0U3RyZWFtIiwib3V0RmlsZSIsImZzIiwiY3JlYXRlV3JpdGVTdHJlYW0iLCJmb3JFYWNoIiwicmVwb3J0ZXIiLCJ1c2VQcm94eSIsInNyYyIsImZpbHRlciIsInNjcmVlbnNob3RzIiwic2NyZWVuc2hvdHNPbkZhaWxzIiwic2NyZWVuc2hvdFBhdGhQYXR0ZXJuIiwicmVjb3JkU2NyZWVuQ2FwdHVyZSIsInN0YXJ0QXBwIiwiYXBwIiwiYXBwSW5pdERlbGF5Iiwib25jZSIsImhpZGVTcGlubmVyIiwicnVuIiwic2hvd01lc3NhZ2VPbkV4aXQiLCJjbG9zZSIsImV4aXQiLCJydW5UZXN0cyIsInByb3ZpZGVyTmFtZSIsImJyb3dzZXJQcm92aWRlclBvb2wiLCJyZXF1aXJlIiwicHJvdmlkZXIiLCJnZXRQcm92aWRlciIsIkdlbmVyYWxFcnJvciIsIk1FU1NBR0UiLCJicm93c2VyUHJvdmlkZXJOb3RGb3VuZCIsImlzTXVsdGlCcm93c2VyIiwiYnJvd3Nlck5hbWVzIiwiZ2V0QnJvd3Nlckxpc3QiLCJkaXNwb3NlIiwiY29uc29sZSIsImpvaW4iLCJicm93c2VyTmFtZSIsImxpc3RCcm93c2VycyIsImV4aXRNZXNzYWdlU2hvd24iLCJleGl0aW5nIiwiZXhpdEhhbmRsZXIiLCJ0ZXJtaW5hdGlvbkxldmVsIiwid3JpdGUiLCJwcm9jZXNzIiwib24iLCJjb2RlIiwic2V0VGltZW91dCIsImVycm9yIiwiZXJyIiwibWVzc2FnZSIsImNvbnN0cnVjdG9yIiwiQVBJRXJyb3IiLCJjb2xvcmVkU3RhY2siLCJzdGFjayIsImNoYWxrIiwicmVkIiwiZ3JheSIsInRlcm1pbmF0aW9uSGFuZGxlciIsIlRlcm1pbmF0aW9uSGFuZGxlciIsIlRFUk1JTkFUSU9OX0xFVkVMX0lOQ1JFQVNFRF9FVkVOVCIsIkNsaUFyZ3VtZW50UGFyc2VyIiwicGFyc2UiLCJhcmd2IiwiY2xpIl0sIm1hcHBpbmdzIjoiOzs7Ozs7OytDQWdFQSxXQUF5QkEsU0FBekIsRUFBb0M7QUFDaEMsY0FBTUMsT0FBb0JELFVBQVVDLElBQXBDO0FBQ0EsY0FBTUMsUUFBb0JELEtBQUtFLEtBQUwsSUFBY0YsS0FBS0UsS0FBTCxDQUFXLENBQVgsQ0FBeEM7QUFDQSxjQUFNQyxRQUFvQkgsS0FBS0UsS0FBTCxJQUFjRixLQUFLRSxLQUFMLENBQVcsQ0FBWCxDQUF4QztBQUNBLGNBQU1FLG9CQUFvQkosS0FBS0ssS0FBL0I7QUFDQSxjQUFNQyxjQUFvQk4sS0FBS00sV0FBL0I7O0FBRUFDLHNCQUFJQyxXQUFKOztBQUVBLGNBQU1DLFdBQWUsTUFBTSxnQkFBZVQsS0FBS1UsUUFBcEIsRUFBOEJULEtBQTlCLEVBQXFDRSxLQUFyQyxFQUE0Q0gsS0FBS1csR0FBakQsRUFBc0RYLEtBQUtZLEdBQTNELENBQTNCO0FBQ0EsY0FBTUMsY0FBaUJkLFVBQVVjLFdBQVYsSUFBeUIsQ0FBaEQ7QUFDQSxjQUFNQyxpQkFBaUIsTUFBTSw2QkFBY0wsUUFBZCxFQUF3QlYsVUFBVWdCLFdBQWxDLEVBQStDZixLQUFLZ0IsTUFBcEQsQ0FBN0I7QUFDQSxjQUFNQyxXQUFpQmxCLFVBQVVrQixRQUFWLENBQW1CQyxNQUFuQixDQUEwQkosY0FBMUIsQ0FBdkI7QUFDQSxjQUFNSyxTQUFpQlYsU0FBU1csWUFBVCxFQUF2QjtBQUNBLFlBQUlDLFNBQWlCLENBQXJCO0FBQ0EsY0FB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QUFFQSxnQkFBSTFGLFVBQVVDLElBQVYsQ0FBZWdFLFlBQW5CLEVBQ0ksTUFBTUEsYUFBYWpFLFVBQVVDLElBQVYsQ0FBZWlELFlBQTVCLENBQU4sQ0FESixLQUdJLE1BQU1ELFNBQVNqRCxTQUFULENBQU47QUFDUCxTQVRELENBVUEsT0FBTzRFLEdBQVAsRUFBWTtBQUNSOUIsZ0NBQW9CLEtBQXBCO0FBQ0E2QixrQkFBTUMsR0FBTjtBQUNIO0FBQ0osS0FuQkQ7O0FBQUEsYUFBZ0JlLEdBQWhCO0FBQUE7QUFBQTs7QUFBQSxXQUFnQkEsR0FBaEI7QUFBQSIsImZpbGUiOiJjbGkvY2xpLmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGZzIGZyb20gJ2ZzJztcbmltcG9ydCBjaGFsayBmcm9tICdjaGFsayc7XG5pbXBvcnQgeyBHZW5lcmFsRXJyb3IsIEFQSUVycm9yIH0gZnJvbSAnLi4vZXJyb3JzL3J1bnRpbWUnO1xuaW1wb3J0IE1FU1NBR0UgZnJvbSAnLi4vZXJyb3JzL3J1bnRpbWUvbWVzc2FnZSc7XG5pbXBvcnQgQ2xpQXJndW1lbnRQYXJzZXIgZnJvbSAnLi9hcmd1bWVudC1wYXJzZXInO1xuaW1wb3J0IFRlcm1pbmF0aW9uSGFuZGxlciBmcm9tICcuL3Rlcm1pbmF0aW9uLWhhbmRsZXInO1xuaW1wb3J0IGxvZyBmcm9tICcuL2xvZyc7XG5pbXBvcnQgcmVtb3Rlc1dpemFyZCBmcm9tICcuL3JlbW90ZXMtd2l6YXJkJztcbmltcG9ydCBjcmVhdGVUZXN0Q2FmZSBmcm9tICcuLi8nO1xuXG5cbmxldCBzaG93TWVzc2FnZU9uRXhpdCA9IHRydWU7XG5sZXQgZXhpdE1lc3NhZ2VTaG93biAgPSBmYWxzZTtcbmxldCBleGl0aW5nICAgICAgICAgICA9IGZhbHNlO1xuXG5mdW5jdGlvbiBleGl0SGFuZGxlciAodGVybWluYXRpb25MZXZlbCkge1xuICAgIGlmIChzaG93TWVzc2FnZU9uRXhpdCAmJiAhZXhpdE1lc3NhZ2VTaG93bikge1xuICAgICAgICBleGl0TWVzc2FnZVNob3duID0gdHJ1ZTtcblxuICAgICAgICBsb2cuaGlkZVNwaW5uZXIoKTtcbiAgICAgICAgbG9nLndyaXRlKCdTdG9wcGluZyBUZXN0Q2FmZS4uLicpO1xuICAgICAgICBsb2cuc2hvd1NwaW5uZXIoKTtcblxuICAgICAgICBwcm9jZXNzLm9uKCdleGl0JywgKCkgPT4gbG9nLmhpZGVTcGlubmVyKHRydWUpKTtcbiAgICB9XG5cbiAgICBpZiAoZXhpdGluZyB8fCB0ZXJtaW5hdGlvbkxldmVsIDwgMilcbiAgICAgICAgcmV0dXJuO1xuXG4gICAgZXhpdGluZyA9IHRydWU7XG5cbiAgICBleGl0KDApO1xufVxuXG5mdW5jdGlvbiBleGl0IChjb2RlKSB7XG4gICAgbG9nLmhpZGVTcGlubmVyKHRydWUpO1xuXG4gICAgLy8gTk9URTogZ2l2ZSBhIHByb2Nlc3MgdGltZSB0byBmbHVzaCB0aGUgb3V0cHV0LlxuICAgIC8vIEl0J3MgbmVjZXNzYXJ5IGluIHNvbWUgZW52aXJvbm1lbnRzLlxuICAgIHNldFRpbWVvdXQoKCkgPT4gcHJvY2Vzcy5leGl0KGNvZGUpLCAwKTtcbn1cblxuZnVuY3Rpb24gZXJyb3IgKGVycikge1xuICAgIGxvZy5oaWRlU3Bpbm5lcigpO1xuXG4gICAgbGV0IG1lc3NhZ2UgPSBudWxsO1xuXG4gICAgLy8gSEFDSzogd29ya2Fyb3VuZCBmb3IgdGhlIGBpbnN0YW5jZW9mYCBwcm9ibGVtXG4gICAgLy8gKHNlZTogaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy8zMzg3MDY4NC93aHktZG9lc250LWluc3RhbmNlb2Ytd29yay1vbi1pbnN0YW5jZXMtb2YtZXJyb3Itc3ViY2xhc3Nlcy11bmRlci1iYWJlbC1ub2RlKVxuICAgIGlmIChlcnIuY29uc3RydWN0b3IgPT09IEdlbmVyYWxFcnJvcilcbiAgICAgICAgbWVzc2FnZSA9IGVyci5tZXNzYWdlO1xuXG4gICAgZWxzZSBpZiAoZXJyLmNvbnN0cnVjdG9yID09PSBBUElFcnJvcilcbiAgICAgICAgbWVzc2FnZSA9IGVyci5jb2xvcmVkU3RhY2s7XG5cbiAgICBlbHNlXG4gICAgICAgIG1lc3NhZ2UgPSBlcnIuc3RhY2s7XG5cbiAgICBsb2cud3JpdGUoY2hhbGsucmVkKCdFUlJPUiAnKSArIG1lc3NhZ2UgKyAnXFxuJyk7XG4gICAgbG9nLndyaXRlKGNoYWxrLmdyYXkoJ1R5cGUgXCJ0ZXN0Y2FmZSAtaFwiIGZvciBoZWxwLicpKTtcblxuICAgIGV4aXQoMSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJ1blRlc3RzIChhcmdQYXJzZXIpIHtcbiAgICBjb25zdCBvcHRzICAgICAgICAgICAgICA9IGFyZ1BhcnNlci5vcHRzO1xuICAgIGNvbnN0IHBvcnQxICAgICAgICAgICAgID0gb3B0cy5wb3J0cyAmJiBvcHRzLnBvcnRzWzBdO1xuICAgIGNvbnN0IHBvcnQyICAgICAgICAgICAgID0gb3B0cy5wb3J0cyAmJiBvcHRzLnBvcnRzWzFdO1xuICAgIGNvbnN0IGV4dGVybmFsUHJveHlIb3N0ID0gb3B0cy5wcm94eTtcbiAgICBjb25zdCBwcm94eUJ5cGFzcyAgICAgICA9IG9wdHMucHJveHlCeXBhc3M7XG5cbiAgICBsb2cuc2hvd1NwaW5uZXIoKTtcblxuICAgIGNvbnN0IHRlc3RDYWZlICAgICA9IGF3YWl0IGNyZWF0ZVRlc3RDYWZlKG9wdHMuaG9zdG5hbWUsIHBvcnQxLCBwb3J0Miwgb3B0cy5zc2wsIG9wdHMuZGV2KTtcbiAgICBjb25zdCBjb25jdXJyZW5jeSAgICA9IGFyZ1BhcnNlci5jb25jdXJyZW5jeSB8fCAxO1xuICAgIGNvbnN0IHJlbW90ZUJyb3dzZXJzID0gYXdhaXQgcmVtb3Rlc1dpemFyZCh0ZXN0Q2FmZSwgYXJnUGFyc2VyLnJlbW90ZUNvdW50LCBvcHRzLnFyQ29kZSk7XG4gICAgY29uc3QgYnJvd3NlcnMgICAgICAgPSBhcmdQYXJzZXIuYnJvd3NlcnMuY29uY2F0KHJlbW90ZUJyb3dzZXJzKTtcbiAgICBjb25zdCBydW5uZXIgICAgICAgICA9IHRlc3RDYWZlLmNyZWF0ZVJ1bm5lcigpO1xuICAgIGxldCBmYWlsZWQgICAgICAgICA9IDA7XG4gICAgY29uc3QgcmVwb3J0ZXJzICAgICAgPSBhcmdQYXJzZXIub3B0cy5yZXBvcnRlcnMubWFwKHIgPT4ge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgbmFtZTogICAgICByLm5hbWUsXG4gICAgICAgICAgICBvdXRTdHJlYW06IHIub3V0RmlsZSA/IGZzLmNyZWF0ZVdyaXRlU3RyZWFtKHIub3V0RmlsZSkgOiB2b2lkIDBcbiAgICAgICAgfTtcbiAgICB9KTtcblxuICAgIHJlcG9ydGVycy5mb3JFYWNoKHIgPT4gcnVubmVyLnJlcG9ydGVyKHIubmFtZSwgci5vdXRTdHJlYW0pKTtcblxuICAgIHJ1bm5lclxuICAgICAgICAudXNlUHJveHkoZXh0ZXJuYWxQcm94eUhvc3QsIHByb3h5QnlwYXNzKVxuICAgICAgICAuc3JjKGFyZ1BhcnNlci5zcmMpXG4gICAgICAgIC5icm93c2Vycyhicm93c2VycylcbiAgICAgICAgLmNvbmN1cnJlbmN5KGNvbmN1cnJlbmN5KVxuICAgICAgICAuZmlsdGVyKGFyZ1BhcnNlci5maWx0ZXIpXG4gICAgICAgIC5zY3JlZW5zaG90cyhvcHRzLnNjcmVlbnNob3RzLCBvcHRzLnNjcmVlbnNob3RzT25GYWlscywgb3B0cy5zY3JlZW5zaG90UGF0aFBhdHRlcm4sIG9wdHMucmVjb3JkU2NyZWVuQ2FwdHVyZSlcbiAgICAgICAgLnN0YXJ0QXBwKG9wdHMuYXBwLCBvcHRzLmFwcEluaXREZWxheSk7XG5cbiAgICBydW5uZXIub25jZSgnZG9uZS1ib290c3RyYXBwaW5nJywgKCkgPT4gbG9nLmhpZGVTcGlubmVyKCkpO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgZmFpbGVkID0gYXdhaXQgcnVubmVyLnJ1bihvcHRzKTtcbiAgICB9XG5cbiAgICBmaW5hbGx5IHtcbiAgICAgICAgc2hvd01lc3NhZ2VPbkV4aXQgPSBmYWxzZTtcbiAgICAgICAgYXdhaXQgdGVzdENhZmUuY2xvc2UoKTtcbiAgICB9XG5cbiAgICBleGl0KGZhaWxlZCk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxpc3RCcm93c2VycyAocHJvdmlkZXJOYW1lID0gJ2xvY2FsbHktaW5zdGFsbGVkJykge1xuICAgIC8vIE5PVEU6IExvYWQgdGhlIHByb3ZpZGVyIHBvb2wgbGF6aWx5IHRvIHJlZHVjZSBzdGFydHVwIHRpbWVcbiAgICBjb25zdCBicm93c2VyUHJvdmlkZXJQb29sID0gcmVxdWlyZSgnLi4vYnJvd3Nlci9wcm92aWRlci9wb29sJyk7XG5cbiAgICBjb25zdCBwcm92aWRlciA9IGF3YWl0IGJyb3dzZXJQcm92aWRlclBvb2wuZ2V0UHJvdmlkZXIocHJvdmlkZXJOYW1lKTtcblxuICAgIGlmICghcHJvdmlkZXIpXG4gICAgICAgIHRocm93IG5ldyBHZW5lcmFsRXJyb3IoTUVTU0FHRS5icm93c2VyUHJvdmlkZXJOb3RGb3VuZCwgcHJvdmlkZXJOYW1lKTtcblxuICAgIGlmIChwcm92aWRlci5pc011bHRpQnJvd3Nlcikge1xuICAgICAgICBjb25zdCBicm93c2VyTmFtZXMgPSBhd2FpdCBwcm92aWRlci5nZXRCcm93c2VyTGlzdCgpO1xuXG4gICAgICAgIGF3YWl0IGJyb3dzZXJQcm92aWRlclBvb2wuZGlzcG9zZSgpO1xuXG4gICAgICAgIGlmIChwcm92aWRlck5hbWUgPT09ICdsb2NhbGx5LWluc3RhbGxlZCcpXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhicm93c2VyTmFtZXMuam9pbignXFxuJykpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhicm93c2VyTmFtZXMubWFwKGJyb3dzZXJOYW1lID0+IGBcIiR7cHJvdmlkZXJOYW1lfToke2Jyb3dzZXJOYW1lfVwiYCkuam9pbignXFxuJykpO1xuICAgIH1cbiAgICBlbHNlXG4gICAgICAgIGNvbnNvbGUubG9nKGBcIiR7cHJvdmlkZXJOYW1lfVwiYCk7XG5cbiAgICBleGl0KDApO1xufVxuXG4oYXN5bmMgZnVuY3Rpb24gY2xpICgpIHtcbiAgICBjb25zdCB0ZXJtaW5hdGlvbkhhbmRsZXIgPSBuZXcgVGVybWluYXRpb25IYW5kbGVyKCk7XG5cbiAgICB0ZXJtaW5hdGlvbkhhbmRsZXIub24oVGVybWluYXRpb25IYW5kbGVyLlRFUk1JTkFUSU9OX0xFVkVMX0lOQ1JFQVNFRF9FVkVOVCwgZXhpdEhhbmRsZXIpO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgYXJnUGFyc2VyID0gbmV3IENsaUFyZ3VtZW50UGFyc2VyKCk7XG5cbiAgICAgICAgYXdhaXQgYXJnUGFyc2VyLnBhcnNlKHByb2Nlc3MuYXJndik7XG5cbiAgICAgICAgaWYgKGFyZ1BhcnNlci5vcHRzLmxpc3RCcm93c2VycylcbiAgICAgICAgICAgIGF3YWl0IGxpc3RCcm93c2VycyhhcmdQYXJzZXIub3B0cy5wcm92aWRlck5hbWUpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICBhd2FpdCBydW5UZXN0cyhhcmdQYXJzZXIpO1xuICAgIH1cbiAgICBjYXRjaCAoZXJyKSB7XG4gICAgICAgIHNob3dNZXNzYWdlT25FeGl0ID0gZmFsc2U7XG4gICAgICAgIGVycm9yKGVycik7XG4gICAgfVxufSkoKTtcblxuIl19
