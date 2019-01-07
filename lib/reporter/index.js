'use strict';

exports.__esModule = true;

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _pinkie = require('pinkie');

var _pinkie2 = _interopRequireDefault(_pinkie);

var _lodash = require('lodash');

var _isStream = require('is-stream');

var _pluginHost = require('./plugin-host');

var _pluginHost2 = _interopRequireDefault(_pluginHost);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class Reporter {
    constructor(plugin, task, outStream) {
        this.plugin = new _pluginHost2.default(plugin, outStream);
        this.task = task;

        this.disposed = false;
        this.passed = 0;
        this.skipped = task.tests.filter(test => test.skip).length;
        this.testCount = task.tests.length - this.skipped;
        this.reportQueue = Reporter._createReportQueue(task);
        this.stopOnFirstFail = task.opts.stopOnFirstFail;
        this.outStream = outStream;

        this._assignTaskEventHandlers();
    }

    static _isSpecialStream(stream) {
        return stream.isTTY || stream === process.stdout || stream === process.stderr;
    }

    static _createPendingPromise() {
        let resolver = null;

        const promise = new _pinkie2.default(resolve => {
            resolver = resolve;
        });

        promise.resolve = resolver;

        return promise;
    }

    static _createReportItem(test, runsPerTest) {
        return {
            fixture: test.fixture,
            test: test,
            screenshotPath: null,
            screenshots: [],
            quarantine: null,
            errs: [],
            unstable: false,
            startTime: null,
            testRunInfo: null,

            pendingRuns: runsPerTest,
            pendingPromise: Reporter._createPendingPromise()
        };
    }

    static _createReportQueue(task) {
        const runsPerTest = task.browserConnectionGroups.length;

        return task.tests.map(test => Reporter._createReportItem(test, runsPerTest));
    }

    static _createTestRunInfo(reportItem) {
        return {
            errs: (0, _lodash.sortBy)(reportItem.errs, ['userAgent', 'type']),
            durationMs: new Date() - reportItem.startTime,
            unstable: reportItem.unstable,
            screenshotPath: reportItem.screenshotPath,
            screenshots: reportItem.screenshots,
            quarantine: reportItem.quarantine,
            skipped: reportItem.test.skip
        };
    }

    _getReportItemForTestRun(testRun) {
        return (0, _lodash.find)(this.reportQueue, i => i.test === testRun.test);
    }

    _shiftReportQueue(reportItem) {
        var _this = this;

        return (0, _asyncToGenerator3.default)(function* () {
            let currentFixture = null;
            let nextReportItem = null;

            while (_this.reportQueue.length && _this.reportQueue[0].testRunInfo) {
                reportItem = _this.reportQueue.shift();
                currentFixture = reportItem.fixture;

                yield _this.plugin.reportTestDone(reportItem.test.name, reportItem.testRunInfo, reportItem.test.meta);

                // NOTE: here we assume that tests are sorted by fixture.
                // Therefore, if the next report item has a different
                // fixture, we can report this fixture start.
                nextReportItem = _this.reportQueue[0];

                if (nextReportItem && nextReportItem.fixture !== currentFixture) yield _this.plugin.reportFixtureStart(nextReportItem.fixture.name, nextReportItem.fixture.path, nextReportItem.fixture.meta);
            }
        })();
    }

    _resolveReportItem(reportItem, testRun) {
        var _this2 = this;

        return (0, _asyncToGenerator3.default)(function* () {
            if (_this2.task.screenshots.hasCapturedFor(testRun.test)) {
                reportItem.screenshotPath = _this2.task.screenshots.getPathFor(testRun.test);
                reportItem.screenshots = _this2.task.screenshots.getScreenshotsInfo(testRun.test);
            }

            if (testRun.quarantine) {
                reportItem.quarantine = testRun.quarantine.attempts.reduce(function (result, errors, index) {
                    const passed = !errors.length;
                    const quarantineAttempt = index + 1;

                    result[quarantineAttempt] = { passed };

                    return result;
                }, {});
            }

            if (!reportItem.testRunInfo) {
                reportItem.testRunInfo = Reporter._createTestRunInfo(reportItem);

                if (!reportItem.errs.length && !reportItem.test.skip) _this2.passed++;
            }

            yield _this2._shiftReportQueue(reportItem);

            reportItem.pendingPromise.resolve();
        })();
    }

    _assignTaskEventHandlers() {
        var _this3 = this;

        const task = this.task;

        task.once('start', (0, _asyncToGenerator3.default)(function* () {
            const startTime = new Date();
            const userAgents = task.browserConnectionGroups.map(function (group) {
                return group[0].userAgent;
            });
            const first = _this3.reportQueue[0];

            yield _this3.plugin.reportTaskStart(startTime, userAgents, _this3.testCount);
            yield _this3.plugin.reportFixtureStart(first.fixture.name, first.fixture.path, first.fixture.meta);
        }));

        task.on('test-run-start', testRun => {
            const reportItem = this._getReportItemForTestRun(testRun);

            if (!reportItem.startTime) reportItem.startTime = new Date();
        });

        task.on('test-run-done', (() => {
            var _ref2 = (0, _asyncToGenerator3.default)(function* (testRun) {
                const reportItem = _this3._getReportItemForTestRun(testRun);
                const isTestRunStoppedTaskExecution = !!testRun.errs.length && _this3.stopOnFirstFail;

                reportItem.pendingRuns = isTestRunStoppedTaskExecution ? 0 : reportItem.pendingRuns - 1;
                reportItem.unstable = reportItem.unstable || testRun.unstable;
                reportItem.errs = reportItem.errs.concat(testRun.errs);

                if (!reportItem.pendingRuns) yield _this3._resolveReportItem(reportItem, testRun);

                yield reportItem.pendingPromise;
            });

            return function (_x) {
                return _ref2.apply(this, arguments);
            };
        })());

        task.once('done', (0, _asyncToGenerator3.default)(function* () {
            const endTime = new Date();

            yield _this3.plugin.reportTaskDone(endTime, _this3.passed, task.warningLog.messages);
        }));
    }

    dispose() {
        var _this4 = this;

        return (0, _asyncToGenerator3.default)(function* () {
            if (_this4.disposed) return;

            _this4.disposed = true;

            if (!_this4.outStream || Reporter._isSpecialStream(_this4.outStream) || !(0, _isStream.writable)(_this4.outStream)) return;

            const p = new _pinkie2.default(function (resolve) {
                _this4.outStream.once('finish', resolve);
                _this4.outStream.once('error', resolve);
            });

            _this4.outStream.end();
            yield p;
        })();
    }
}
exports.default = Reporter;
module.exports = exports['default'];
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9yZXBvcnRlci9pbmRleC5qcyJdLCJuYW1lcyI6WyJSZXBvcnRlciIsImNvbnN0cnVjdG9yIiwicGx1Z2luIiwidGFzayIsIm91dFN0cmVhbSIsIlJlcG9ydGVyUGx1Z2luSG9zdCIsImRpc3Bvc2VkIiwicGFzc2VkIiwic2tpcHBlZCIsInRlc3RzIiwiZmlsdGVyIiwidGVzdCIsInNraXAiLCJsZW5ndGgiLCJ0ZXN0Q291bnQiLCJyZXBvcnRRdWV1ZSIsIl9jcmVhdGVSZXBvcnRRdWV1ZSIsInN0b3BPbkZpcnN0RmFpbCIsIm9wdHMiLCJfYXNzaWduVGFza0V2ZW50SGFuZGxlcnMiLCJfaXNTcGVjaWFsU3RyZWFtIiwic3RyZWFtIiwiaXNUVFkiLCJwcm9jZXNzIiwic3Rkb3V0Iiwic3RkZXJyIiwiX2NyZWF0ZVBlbmRpbmdQcm9taXNlIiwicmVzb2x2ZXIiLCJwcm9taXNlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJfY3JlYXRlUmVwb3J0SXRlbSIsInJ1bnNQZXJUZXN0IiwiZml4dHVyZSIsInNjcmVlbnNob3RQYXRoIiwic2NyZWVuc2hvdHMiLCJxdWFyYW50aW5lIiwiZXJycyIsInVuc3RhYmxlIiwic3RhcnRUaW1lIiwidGVzdFJ1bkluZm8iLCJwZW5kaW5nUnVucyIsInBlbmRpbmdQcm9taXNlIiwiYnJvd3NlckNvbm5lY3Rpb25Hcm91cHMiLCJtYXAiLCJfY3JlYXRlVGVzdFJ1bkluZm8iLCJyZXBvcnRJdGVtIiwiZHVyYXRpb25NcyIsIkRhdGUiLCJfZ2V0UmVwb3J0SXRlbUZvclRlc3RSdW4iLCJ0ZXN0UnVuIiwiaSIsIl9zaGlmdFJlcG9ydFF1ZXVlIiwiY3VycmVudEZpeHR1cmUiLCJuZXh0UmVwb3J0SXRlbSIsInNoaWZ0IiwicmVwb3J0VGVzdERvbmUiLCJuYW1lIiwibWV0YSIsInJlcG9ydEZpeHR1cmVTdGFydCIsInBhdGgiLCJfcmVzb2x2ZVJlcG9ydEl0ZW0iLCJoYXNDYXB0dXJlZEZvciIsImdldFBhdGhGb3IiLCJnZXRTY3JlZW5zaG90c0luZm8iLCJhdHRlbXB0cyIsInJlZHVjZSIsInJlc3VsdCIsImVycm9ycyIsImluZGV4IiwicXVhcmFudGluZUF0dGVtcHQiLCJvbmNlIiwidXNlckFnZW50cyIsImdyb3VwIiwidXNlckFnZW50IiwiZmlyc3QiLCJyZXBvcnRUYXNrU3RhcnQiLCJvbiIsImlzVGVzdFJ1blN0b3BwZWRUYXNrRXhlY3V0aW9uIiwiY29uY2F0IiwiZW5kVGltZSIsInJlcG9ydFRhc2tEb25lIiwid2FybmluZ0xvZyIsIm1lc3NhZ2VzIiwiZGlzcG9zZSIsInAiLCJlbmQiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7O0FBQUE7Ozs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7O0FBRWUsTUFBTUEsUUFBTixDQUFlO0FBQzFCQyxnQkFBYUMsTUFBYixFQUFxQkMsSUFBckIsRUFBMkJDLFNBQTNCLEVBQXNDO0FBQ2xDLGFBQUtGLE1BQUwsR0FBYyxJQUFJRyxvQkFBSixDQUF1QkgsTUFBdkIsRUFBK0JFLFNBQS9CLENBQWQ7QUFDQSxhQUFLRCxJQUFMLEdBQWNBLElBQWQ7O0FBRUEsYUFBS0csUUFBTCxHQUF1QixLQUF2QjtBQUNBLGFBQUtDLE1BQUwsR0FBdUIsQ0FBdkI7QUFDQSxhQUFLQyxPQUFMLEdBQXVCTCxLQUFLTSxLQUFMLENBQVdDLE1BQVgsQ0FBa0JDLFFBQVFBLEtBQUtDLElBQS9CLEVBQXFDQyxNQUE1RDtBQUNBLGFBQUtDLFNBQUwsR0FBdUJYLEtBQUtNLEtBQUwsQ0FBV0ksTUFBWCxHQUFvQixLQUFLTCxPQUFoRDtBQUNBLGFBQUtPLFdBQUwsR0FBdUJmLFNBQVNnQixrQkFBVCxDQUE0QmIsSUFBNUIsQ0FBdkI7QUFDQSxhQUFLYyxlQUFMLEdBQXVCZCxLQUFLZSxJQUFMLENBQVVELGVBQWpDO0FBQ0EsYUFBS2IsU0FBTCxHQUF1QkEsU0FBdkI7O0FBRUEsYUFBS2Usd0JBQUw7QUFDSDs7QUFFRCxXQUFPQyxnQkFBUCxDQUF5QkMsTUFBekIsRUFBaUM7QUFDN0IsZUFBT0EsT0FBT0MsS0FBUCxJ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QkFBSzFCLFNBQUwsQ0FBZWtGLEdBQWY7QUFDQSxrQkFBTUQsQ0FBTjtBQWZhO0FBZ0JoQjtBQWhMeUI7a0JBQVRyRixRIiwiZmlsZSI6InJlcG9ydGVyL2luZGV4LmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFByb21pc2UgZnJvbSAncGlua2llJztcbmltcG9ydCB7IGZpbmQsIHNvcnRCeSB9IGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgeyB3cml0YWJsZSBhcyBpc1dyaXRhYmxlU3RyZWFtIH0gZnJvbSAnaXMtc3RyZWFtJztcbmltcG9ydCBSZXBvcnRlclBsdWdpbkhvc3QgZnJvbSAnLi9wbHVnaW4taG9zdCc7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFJlcG9ydGVyIHtcbiAgICBjb25zdHJ1Y3RvciAocGx1Z2luLCB0YXNrLCBvdXRTdHJlYW0pIHtcbiAgICAgICAgdGhpcy5wbHVnaW4gPSBuZXcgUmVwb3J0ZXJQbHVnaW5Ib3N0KHBsdWdpbiwgb3V0U3RyZWFtKTtcbiAgICAgICAgdGhpcy50YXNrICAgPSB0YXNrO1xuXG4gICAgICAgIHRoaXMuZGlzcG9zZWQgICAgICAgID0gZmFsc2U7XG4gICAgICAgIHRoaXMucGFzc2VkICAgICAgICAgID0gMDtcbiAgICAgICAgdGhpcy5za2lwcGVkICAgICAgICAgPSB0YXNrLnRlc3RzLmZpbHRlcih0ZXN0ID0+IHRlc3Quc2tpcCkubGVuZ3RoO1xuICAgICAgICB0aGlzLnRlc3RDb3VudCAgICAgICA9IHRhc2sudGVzdHMubGVuZ3RoIC0gdGhpcy5za2lwcGVkO1xuICAgICAgICB0aGlzLnJlcG9ydFF1ZXVlICAgICA9IFJlcG9ydGVyLl9jcmVhdGVSZXBvcnRRdWV1ZSh0YXNrKTtcbiAgICAgICAgdGhpcy5zdG9wT25GaXJzdEZhaWwgPSB0YXNrLm9wdHMuc3RvcE9uRmlyc3RGYWlsO1xuICAgICAgICB0aGlzLm91dFN0cmVhbSAgICAgICA9IG91dFN0cmVhbTtcblxuICAgICAgICB0aGlzLl9hc3NpZ25UYXNrRXZlbnRIYW5kbGVycygpO1xuICAgIH1cblxuICAgIHN0YXRpYyBfaXNTcGVjaWFsU3RyZWFtIChzdHJlYW0pIHtcbiAgICAgICAgcmV0dXJuIHN0cmVhbS5pc1RUWSB8fCBzdHJlYW0gPT09IHByb2Nlc3Muc3Rkb3V0IHx8IHN0cmVhbSA9PT0gcHJvY2Vzcy5zdGRlcnI7XG4gICAgfVxuXG4gICAgc3RhdGljIF9jcmVhdGVQZW5kaW5nUHJvbWlzZSAoKSB7XG4gICAgICAgIGxldCByZXNvbHZlciA9IG51bGw7XG5cbiAgICAgICAgY29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgICAgICAgcmVzb2x2ZXIgPSByZXNvbHZlO1xuICAgICAgICB9KTtcblxuICAgICAgICBwcm9taXNlLnJlc29sdmUgPSByZXNvbHZlcjtcblxuICAgICAgICByZXR1cm4gcHJvbWlzZTtcbiAgICB9XG5cbiAgICBzdGF0aWMgX2NyZWF0ZVJlcG9ydEl0ZW0gKHRlc3QsIHJ1bnNQZXJUZXN0KSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBmaXh0dXJlOiAgICAgICAgdGVzdC5maXh0dXJlLFxuICAgICAgICAgICAgdGVzdDogICAgICAgICAgIHRlc3QsXG4gICAgICAgICAgICBzY3JlZW5zaG90UGF0aDogbnVsbCxcbiAgICAgICAgICAgIHNjcmVlbnNob3RzOiAgICBbXSxcbiAgICAgICAgICAgIHF1YXJhbnRpbmU6ICAgICBudWxsLFxuICAgICAgICAgICAgZXJyczogICAgICAgICAgIFtdLFxuICAgICAgICAgICAgdW5zdGFibGU6ICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgc3RhcnRUaW1lOiAgICAgIG51bGwsXG4gICAgICAgICAgICB0ZXN0UnVuSW5mbzogICAgbnVsbCxcblxuICAgICAgICAgICAgcGVuZGluZ1J1bnM6ICAgIHJ1bnNQZXJUZXN0LFxuICAgICAgICAgICAgcGVuZGluZ1Byb21pc2U6IFJlcG9ydGVyLl9jcmVhdGVQZW5kaW5nUHJvbWlzZSgpXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgc3RhdGljIF9jcmVhdGVSZXBvcnRRdWV1ZSAodGFzaykge1xuICAgICAgICBjb25zdCBydW5zUGVyVGVzdCA9IHRhc2suYnJvd3NlckNvbm5lY3Rpb25Hcm91cHMubGVuZ3RoO1xuXG4gICAgICAgIHJldHVybiB0YXNrLnRlc3RzLm1hcCh0ZXN0ID0+IFJlcG9ydGVyLl9jcmVhdGVSZXBvcnRJdGVtKHRlc3QsIHJ1bnNQZXJUZXN0KSk7XG4gICAgfVxuXG4gICAgc3RhdGljIF9jcmVhdGVUZXN0UnVuSW5mbyAocmVwb3J0SXRlbSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgZXJyczogICAgICAgICAgIHNvcnRCeShyZXBvcnRJdGVtLmVycnMsIFsndXNlckFnZW50JywgJ3R5cGUnXSksXG4gICAgICAgICAgICBkdXJhdGlvbk1zOiAgICAgbmV3IERhdGUoKSAtIHJlcG9ydEl0ZW0uc3RhcnRUaW1lLFxuICAgICAgICAgICAgdW5zdGFibGU6ICAgICAgIHJlcG9ydEl0ZW0udW5zdGFibGUsXG4gICAgICAgICAgICBzY3JlZW5zaG90UGF0aDogcmVwb3J0SXRlbS5zY3JlZW5zaG90UGF0aCxcbiAgICAgICAgICAgIHNjcmVlbnNob3RzOiAgICByZXBvcnRJdGVtLnNjcmVlbnNob3RzLFxuICAgICAgICAgICAgcXVhcmFudGluZTogICAgIHJlcG9ydEl0ZW0ucXVhcmFudGluZSxcbiAgICAgICAgICAgIHNraXBwZWQ6ICAgICAgICByZXBvcnRJdGVtLnRlc3Quc2tpcFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIF9nZXRSZXBvcnRJdGVtRm9yVGVzdFJ1biAodGVzdFJ1bikge1xuICAgICAgICByZXR1cm4gZmluZCh0aGlzLnJlcG9ydFF1ZXVlLCBpID0+IGkudGVzdCA9PT0gdGVzdFJ1bi50ZXN0KTtcbiAgICB9XG5cbiAgICBhc3luYyBfc2hpZnRSZXBvcnRRdWV1ZSAocmVwb3J0SXRlbSkge1xuICAgICAgICBsZXQgY3VycmVudEZpeHR1cmUgPSBudWxsO1xuICAgICAgICBsZXQgbmV4dFJlcG9ydEl0ZW0gPSBudWxsO1xuXG4gICAgICAgIHdoaWxlICh0aGlzLnJlcG9ydFF1ZXVlLmxlbmd0aCAmJiB0aGlzLnJlcG9ydFF1ZXVlWzBdLnRlc3RSdW5JbmZvKSB7XG4gICAgICAgICAgICByZXBvcnRJdGVtICAgICA9IHRoaXMucmVwb3J0UXVldWUuc2hpZnQoKTtcbiAgICAgICAgICAgIGN1cnJlbnRGaXh0dXJlID0gcmVwb3J0SXRlbS5maXh0dXJlO1xuXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5yZXBvcnRUZXN0RG9uZShyZXBvcnRJdGVtLnRlc3QubmFtZSwgcmVwb3J0SXRlbS50ZXN0UnVuSW5mbywgcmVwb3J0SXRlbS50ZXN0Lm1ldGEpO1xuXG4gICAgICAgICAgICAvLyBOT1RFOiBoZXJlIHdlIGFzc3VtZSB0aGF0IHRlc3RzIGFyZSBzb3J0ZWQgYnkgZml4dHVyZS5cbiAgICAgICAgICAgIC8vIFRoZXJlZm9yZSwgaWYgdGhlIG5leHQgcmVwb3J0IGl0ZW0gaGFzIGEgZGlmZmVyZW50XG4gICAgICAgICAgICAvLyBmaXh0dXJlLCB3ZSBjYW4gcmVwb3J0IHRoaXMgZml4dHVyZSBzdGFydC5cbiAgICAgICAgICAgIG5leHRSZXBvcnRJdGVtID0gdGhpcy5yZXBvcnRRdWV1ZVswXTtcblxuICAgICAgICAgICAgaWYgKG5leHRSZXBvcnRJdGVtICYmIG5leHRSZXBvcnRJdGVtLmZpeHR1cmUgIT09IGN1cnJlbnRGaXh0dXJlKVxuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnJlcG9ydEZpeHR1cmVTdGFydChuZXh0UmVwb3J0SXRlbS5maXh0dXJlLm5hbWUsIG5leHRSZXBvcnRJdGVtLmZpeHR1cmUucGF0aCwgbmV4dFJlcG9ydEl0ZW0uZml4dHVyZS5tZXRhKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGFzeW5jIF9yZXNvbHZlUmVwb3J0SXRlbSAocmVwb3J0SXRlbSwgdGVzdFJ1bikge1xuICAgICAgICBpZiAodGhpcy50YXNrLnNjcmVlbnNob3RzLmhhc0NhcHR1cmVkRm9yKHRlc3RSdW4udGVzdCkpIHtcbiAgICAgICAgICAgIHJlcG9ydEl0ZW0uc2NyZWVuc2hvdFBhdGggPSB0aGlzLnRhc2suc2NyZWVuc2hvdHMuZ2V0UGF0aEZvcih0ZXN0UnVuLnRlc3QpO1xuICAgICAgICAgICAgcmVwb3J0SXRlbS5zY3JlZW5zaG90cyAgICA9IHRoaXMudGFzay5zY3JlZW5zaG90cy5nZXRTY3JlZW5zaG90c0luZm8odGVzdFJ1bi50ZXN0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0ZXN0UnVuLnF1YXJhbnRpbmUpIHtcbiAgICAgICAgICAgIHJlcG9ydEl0ZW0ucXVhcmFudGluZSA9IHRlc3RSdW4ucXVhcmFudGluZS5hdHRlbXB0cy5yZWR1Y2UoKHJlc3VsdCwgZXJyb3JzLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhc3NlZCAgICAgICAgICAgID0gIWVycm9ycy5sZW5ndGg7XG4gICAgICAgICAgICAgICAgY29uc3QgcXVhcmFudGluZUF0dGVtcHQgPSBpbmRleCArIDE7XG5cbiAgICAgICAgICAgICAgICByZXN1bHRbcXVhcmFudGluZUF0dGVtcHRdID0geyBwYXNzZWQgfTtcblxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9LCB7fSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXJlcG9ydEl0ZW0udGVzdFJ1bkluZm8pIHtcbiAgICAgICAgICAgIHJlcG9ydEl0ZW0udGVzdFJ1bkluZm8gPSBSZXBvcnRlci5fY3JlYXRlVGVzdFJ1bkluZm8ocmVwb3J0SXRlbSk7XG5cbiAgICAgICAgICAgIGlmICghcmVwb3J0SXRlbS5lcnJzLmxlbmd0aCAmJiAhcmVwb3J0SXRlbS50ZXN0LnNraXApXG4gICAgICAgICAgICAgICAgdGhpcy5wYXNzZWQrKztcbiAgICAgICAgfVxuXG4gICAgICAgIGF3YWl0IHRoaXMuX3NoaWZ0UmVwb3J0UXVldWUocmVwb3J0SXRlbSk7XG5cbiAgICAgICAgcmVwb3J0SXRlbS5wZW5kaW5nUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuXG4gICAgX2Fzc2lnblRhc2tFdmVudEhhbmRsZXJzICgpIHtcbiAgICAgICAgY29uc3QgdGFzayA9IHRoaXMudGFzaztcblxuICAgICAgICB0YXNrLm9uY2UoJ3N0YXJ0JywgYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc3RhcnRUaW1lICA9IG5ldyBEYXRlKCk7XG4gICAgICAgICAgICBjb25zdCB1c2VyQWdlbnRzID0gdGFzay5icm93c2VyQ29ubmVjdGlvbkdyb3Vwcy5tYXAoZ3JvdXAgPT4gZ3JvdXBbMF0udXNlckFnZW50KTtcbiAgICAgICAgICAgIGNvbnN0IGZpcnN0ICAgICAgPSB0aGlzLnJlcG9ydFF1ZXVlWzBdO1xuXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5yZXBvcnRUYXNrU3RhcnQoc3RhcnRUaW1lLCB1c2VyQWdlbnRzLCB0aGlzLnRlc3RDb3VudCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5yZXBvcnRGaXh0dXJlU3RhcnQoZmlyc3QuZml4dHVyZS5uYW1lLCBmaXJzdC5maXh0dXJlLnBhdGgsIGZpcnN0LmZpeHR1cmUubWV0YSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRhc2sub24oJ3Rlc3QtcnVuLXN0YXJ0JywgdGVzdFJ1biA9PiB7XG4gICAgICAgICAgICBjb25zdCByZXBvcnRJdGVtID0gdGhpcy5fZ2V0UmVwb3J0SXRlbUZvclRlc3RSdW4odGVzdFJ1bik7XG5cbiAgICAgICAgICAgIGlmICghcmVwb3J0SXRlbS5zdGFydFRpbWUpXG4gICAgICAgICAgICAgICAgcmVwb3J0SXRlbS5zdGFydFRpbWUgPSBuZXcgRGF0ZSgpO1xuICAgICAgICB9KTtcblxuICAgICAgICB0YXNrLm9uKCd0ZXN0LXJ1bi1kb25lJywgYXN5bmMgdGVzdFJ1biA9PiB7XG4gICAgICAgICAgICBjb25zdCByZXBvcnRJdGVtICAgICAgICAgICAgICAgICAgICA9IHRoaXMuX2dldFJlcG9ydEl0ZW1Gb3JUZXN0UnVuKHRlc3RSdW4pO1xuICAgICAgICAgICAgY29uc3QgaXNUZXN0UnVuU3RvcHBlZFRhc2tFeGVjdXRpb24gPSAhIXRlc3RSdW4uZXJycy5sZW5ndGggJiYgdGhpcy5zdG9wT25GaXJzdEZhaWw7XG5cbiAgICAgICAgICAgIHJlcG9ydEl0ZW0ucGVuZGluZ1J1bnMgPSBpc1Rlc3RSdW5TdG9wcGVkVGFza0V4ZWN1dGlvbiA/IDAgOiByZXBvcnRJdGVtLnBlbmRpbmdSdW5zIC0gMTtcbiAgICAgICAgICAgIHJlcG9ydEl0ZW0udW5zdGFibGUgICAgPSByZXBvcnRJdGVtLnVuc3RhYmxlIHx8IHRlc3RSdW4udW5zdGFibGU7XG4gICAgICAgICAgICByZXBvcnRJdGVtLmVycnMgICAgICAgID0gcmVwb3J0SXRlbS5lcnJzLmNvbmNhdCh0ZXN0UnVuLmVycnMpO1xuXG4gICAgICAgICAgICBpZiAoIXJlcG9ydEl0ZW0ucGVuZGluZ1J1bnMpXG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5fcmVzb2x2ZVJlcG9ydEl0ZW0ocmVwb3J0SXRlbSwgdGVzdFJ1bik7XG5cbiAgICAgICAgICAgIGF3YWl0IHJlcG9ydEl0ZW0ucGVuZGluZ1Byb21pc2U7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRhc2sub25jZSgnZG9uZScsIGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGVuZFRpbWUgPSBuZXcgRGF0ZSgpO1xuXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5yZXBvcnRUYXNrRG9uZShlbmRUaW1lLCB0aGlzLnBhc3NlZCwgdGFzay53YXJuaW5nTG9nLm1lc3NhZ2VzKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgYXN5bmMgZGlzcG9zZSAoKSB7XG4gICAgICAgIGlmICh0aGlzLmRpc3Bvc2VkKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuZGlzcG9zZWQgPSB0cnVlO1xuXG4gICAgICAgIGlmICghdGhpcy5vdXRTdHJlYW0gfHwgUmVwb3J0ZXIuX2lzU3BlY2lhbFN0cmVhbSh0aGlzLm91dFN0cmVhbSkgfHwgIWlzV3JpdGFibGVTdHJlYW0odGhpcy5vdXRTdHJlYW0pKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIGNvbnN0IHAgPSBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgICAgICAgIHRoaXMub3V0U3RyZWFtLm9uY2UoJ2ZpbmlzaCcsIHJlc29sdmUpO1xuICAgICAgICAgICAgdGhpcy5vdXRTdHJlYW0ub25jZSgnZXJyb3InLCByZXNvbHZlKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5vdXRTdHJlYW0uZW5kKCk7XG4gICAgICAgIGF3YWl0IHA7XG4gICAgfVxufVxuIl19
