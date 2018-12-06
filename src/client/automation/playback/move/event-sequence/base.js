import hammerhead from '../../../deps/hammerhead';
import { domUtils } from '../../../deps/testcafe-core';

const browserUtils = hammerhead.utils.browser;

export default class MoveEventSequenceBase {
    constructor () {
        this.dragAndDropMode = false;
        this.dropAllowed     = false;
    }

    setup () {
        this.dragAndDropMode = false;
        this.dropAllowed     = false;
    }

    leaveElement (/* currentElement, prevElement, commonAncestor, options */) {
    }

    move (/* element, options, moveEvent */) {
    }

    enterElement (/* currentElement, prevElement, commonAncestor, options */) {
    }

    dragAndDrop (/* dragElement, currentElement, prevElement, options, dragDataStore */) {
    }

    teardown (/* currentElement, eventOptions, prevElement, moveEvent */) {
    }

    run (currentElement, prevElement, options, moveEvent, dragElement, dragDataStore) {
        // NOTE: if last hovered element was in an iframe that has been removed, IE
        // raises an exception when we try to compare it with the current element
        const prevElementInDocument = prevElement && domUtils.isElementInDocument(prevElement);

        const prevElementInRemovedIframe = prevElement && domUtils.isElementInIframe(prevElement) &&
                                         !domUtils.getIframeByElement(prevElement);

        if (!prevElementInDocument || prevElementInRemovedIframe)
            prevElement = null;

        const elementChanged = currentElement !== prevElement;
        const commonAncestor = elementChanged ? domUtils.getCommonAncestor(currentElement, prevElement) : null;

        this.setup();

        if (elementChanged && !!prevElement)
            this.leaveElement(currentElement, prevElement, commonAncestor, options);

        if (browserUtils.isIE)
            this.move(currentElement, options, moveEvent);

        if (elementChanged && domUtils.isElementInDocument(currentElement))
            this.enterElement(currentElement, prevElement, commonAncestor, options);

        if (!browserUtils.isIE)
            this.move(currentElement, options, moveEvent);

        this.dragAndDrop(dragElement, currentElement, prevElement, options, dragDataStore);
        this.teardown(currentElement, options, prevElement, moveEvent);

        const dragAndDropMode = this.dragAndDropMode;
        const dropAllowed     = this.dropAllowed;

        this.dragAndDropMode = false;
        this.dropAllowed     = false;

        return { dragAndDropMode, dropAllowed };
    }
}
