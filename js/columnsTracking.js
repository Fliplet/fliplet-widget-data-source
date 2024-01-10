Fliplet.Registry.set('columns-tracking', (() => {
  const HistoryStack = Fliplet.Registry.get('history-stack');

  let reference = [];
  let current = [];
  let removedSinceReference = [];

  const saveStateAsCurrent = (state) => {
    current = state;
  };

  const getOriginal = () => HistoryStack.getFirst().getData()[0];

  const getReference = () => {
    if (!reference.length) {
      reference = getOriginal();
    }

    return reference;
  };

  const removeColumns = (index, amount) => {
    const currentReference = getReference();
    const removed = reference.slice(index, index + amount);

    const currentRemovedSinceReference = removed.filter((column) =>
      currentReference.includes(column)
    );

    removedSinceReference = [
      ...new Set([...removedSinceReference, ...currentRemovedSinceReference])
    ].filter(Boolean);

    reference.splice(index, amount);
  };

  const moveColumnsInCollection = (collection, columnOriginalIndexes, toIndex) => {
    const columnsToMove = columnOriginalIndexes.map((index) => collection[index]);

    const collectionClone = [...collection];

    collectionClone.splice(columnOriginalIndexes[0], columnOriginalIndexes.length);
    collectionClone.splice(toIndex, 0, ...columnsToMove);

    return collectionClone;
  };

  const moveColumns = (columnOriginalIndexes, toIndex) => {
    const currentReference = getReference();

    current = moveColumnsInCollection(current, columnOriginalIndexes, toIndex);
    reference = moveColumnsInCollection(currentReference, columnOriginalIndexes, toIndex);
  };

  const getRenamedColumns = () => {
    const currentReference = getReference();
    const renamedIndexes = currentReference.reduce((acc, column, index) => {
      if (column && current[index] && column !== current[index]) {
        acc.push(index);
      }

      return acc;
    }, []);

    return renamedIndexes.map((index) => ({
      column: reference[index],
      newColumn: current[index]
    }));
  };

  const getCommitPayload = () => ({
    deleteColumns: removedSinceReference,
    renameColumns: getRenamedColumns()
  });

  const reset = () => {
    const newReference = HistoryStack.getCurrent().getData()[0];

    reference = newReference;
    current = newReference;
    removedSinceReference = [];
  };

  return {
    saveStateAsCurrent,
    removeColumns,
    moveColumns,
    getCommitPayload,
    reset
  };
})());
