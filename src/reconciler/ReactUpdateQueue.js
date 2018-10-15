import {NoWork} from './ReactFiberExpirationTime'
// Assume when processing the updateQueue, process all updates together
class UpdateQueue {
  constructor (baseState) {
    this.baseState = baseState
    this.firstUpdate = null
    this.lastUpdate = null
  }
}

class Update {
  constructor () {
    this.payload = null
    this.next = null
  }
}

export function createUpdate () {
  return new Update()
}

function appendUpdateToQueue (queue, update) {
  // Append the update to the end of the list.
  if (queue.lastUpdate === null) {
    // Queue is empty
    queue.firstUpdate = queue.lastUpdate = update
  } else {
    queue.lastUpdate.next = update
    queue.lastUpdate = update
  }
}

export function enqueueUpdate (fiber, update) {
  // Update queues are created lazily.
  let queue = fiber.updateQueue
  if (queue === null) {
    queue = fiber.updateQueue = new UpdateQueue(fiber.memoizedState)
  }
  appendUpdateToQueue(queue, update)
}

function getStateFromUpdate (update, prevState) {
  const partialState = update.payload
  if (partialState === null || partialState === undefined) {
    // Null and undefined are treated as no-ops.
    return prevState
  }
  // Merge the partial state and the previous state.
  return Object.assign({}, prevState, partialState)
}

export function processUpdateQueue (workInProgress, queue) {
  // Iterate through the list of updates to compute the result.
  let update = queue.firstUpdate
  let resultState = queue.baseState
  while (update !== null) {
    resultState = getStateFromUpdate(update, resultState)
    update = update.next
  }
  queue.baseState = resultState
  queue.firstUpdate = queue.lastUpdate = null
  workInProgress.expirationTime = NoWork
  workInProgress.memoizedState = resultState
}
