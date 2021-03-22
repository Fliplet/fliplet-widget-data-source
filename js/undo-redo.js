function undoRedo(event) {
  var ctrlDown = (event.ctrlKey || event.metaKey) && !event.altKey;

  if (!ctrlDown) {
    return '';
  }
  
  if (event.keyCode === 89 || (event.shiftKey && event.keyCode === 90)) { // CTRL + Y or CTRL + SHIFT + Z
    return 'redo';
  } else if (event.keyCode === 90) { // CTRL + Z
    return 'undo';
  } else {
    return '';
  }
}

function isUndo(event) {
  return 'undo' === undoRedo(event);
}

function isRedo(event) {
  return 'redo' === undoRedo(event);
}