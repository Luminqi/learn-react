import { createHostRootFiber } from './ReactFiber'
import { NoWork } from './ReactFiberExpirationTime'

export function createFiberRoot (containerInfo) {
  let uninitializedFiber = createHostRootFiber()
  let root = {
    // The currently active root fiber. This is the mutable root of the tree.
    current: uninitializedFiber,
    // Any additional information from the host associated with this root.
    containerInfo: containerInfo,
    // A finished work-in-progress HostRoot that's ready to be committed.
    finishedWork: null,
    expirationTime: NoWork
  }
  uninitializedFiber.stateNode = root
  return root
}