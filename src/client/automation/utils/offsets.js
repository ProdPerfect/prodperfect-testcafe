import { positionUtils } from '../deps/testcafe-core';
import getAutomationPoint from './get-automation-point';

function calcOffset (size) {
    const offset = size / 2;

    return offset < 1 ? 0 : Math.round(offset);
}

export function getDefaultAutomationOffsets (element) {
    var rect    = positionUtils.getElementRectangle(element);
    var offsetX = calcOffset(rect.width);
    var offsetY = calcOffset(rect.height);

    return { offsetX, offsetY };
}

export function getOffsetOptions (element, offsetX, offsetY) {
    var defaultOffsets = getDefaultAutomationOffsets(element);

    offsetX = typeof offsetX === 'number' ? Math.round(offsetX) : defaultOffsets.offsetX;
    offsetY = typeof offsetY === 'number' ? Math.round(offsetY) : defaultOffsets.offsetY;

    if (offsetX > 0 && offsetY > 0)
        return { offsetX, offsetY };

    var dimensions = positionUtils.getClientDimensions(element);
    var width      = Math.round(Math.max(element.scrollWidth, dimensions.width));
    var height     = Math.round(Math.max(element.scrollHeight, dimensions.height));
    var maxX       = dimensions.scrollbar.right + dimensions.border.left + dimensions.border.right + width;
    var maxY       = dimensions.scrollbar.bottom + dimensions.border.top + dimensions.border.bottom + height;

    return {
        offsetX: offsetX < 0 ? maxX + offsetX : offsetX,
        offsetY: offsetY < 0 ? maxY + offsetY : offsetY
    };
}

export function getMoveAutomationOffsets (element, offsetX, offsetY) {
    var clickOnElement = positionUtils.containsOffset(element, offsetX, offsetY);

    if (clickOnElement)
        return { offsetX, offsetY };

    var actionPoint = getAutomationPoint(element, offsetX, offsetY);

    return {
        offsetX: actionPoint.x,
        offsetY: actionPoint.y
    };
}
