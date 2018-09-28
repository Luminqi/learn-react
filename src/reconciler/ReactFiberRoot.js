import { createHostRootFiber } from './ReactFiber'
import { NoWork } from './ReactFiberExpirationTime'

export function createFiberRoot (containerInfo) {
  let uninitializedFiber = createHostRootFiber()
  let root = {
    // The currently active root fiber. This is the mutable root of the tree.
    current: uninitializedFiber,
    // Any additional information from the host associated with this root.
    containerInfo: containerInfo,
    // Used only by persistent updates.
    pendingChildren: null,

    // The following priority levels are used to distinguish between 1)
    // uncommitted work, 2) uncommitted work that is suspended, and 3) uncommitted
    // work that may be unsuspended. We choose not to track each individual
    // pending level, trading granularity for performance.
    // The earliest and latest priority levels that are not known to be suspended.
    earliestPendingTime: NoWork,
    latestPendingTime: NoWork,
    // The earliest and latest priority levels that are suspended from committing.
    earliestSuspendedTime: NoWork,
    latestSuspendedTime: NoWork,
    // The latest priority level that was pinged by a resolved promise and can be retried.
    latestPingedTime: NoWork,

    // If an error is thrown, and there are no more updates in the queue, we try
    // rendering from the root one more time, synchronously, before handling
    // the error
    didError: false,

    pendingCommitExpirationTime: NoWork,
    // A finished work-in-progress HostRoot that's ready to be committed.
    finishedWork: null,
    // Timeout handle returned by setTimeout. Used to cancel a pending timeout, if
    // it's superseded by a new one.
    timeoutHandle: -1, //type TimeoutHandle = TimeoutID;// NoTimeout = -1;
    // Top context object, used by renderSubtreeIntoContainer
    context: null,
    pendingContext: null,
    // Remaining expiration time on this root.
    nextExpirationTimeToWorkOn: NoWork,
    expirationTime: NoWork,
    // List of top-level batches. This list indicates whether a commit should be
    // deferred. Also contains completion callbacks.
    firstBatch: null,
    // Linked-list of roots
    // nextScheduledRoot: null // ignored as we suppose there is only one root
  }
  uninitializedFiber.stateNode = root
  return root
}