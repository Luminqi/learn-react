import {
  NoWork,
  Sync,
  msToExpirationTime,
  expirationTimeToMs,
  computeAsyncExpiration,
  computeInteractiveExpiration
} from './ReactFiberExpirationTime'
import { createUpdate, enqueueUpdate, processUpdateQueue } from './ReactUpdateQueue'
import { createFiberRoot } from './ReactFiberRoot'
import { FiberNode } from './ReactFiber'
import { isInteractiveEvent, registrationNames } from './isInteractiveEvent'
import {
  ClassComponent,
  HostRoot, // Root of a host tree. Could be nested inside another node.
  HostComponent,
  PlaceholderComponent
} from '../shared/ReactWorkTags'
import {
  NoEffect,
  PerformedWork,
  Placement,
  Update,
  DidCapture,
  Snapshot,
  HostEffectMask,
  Incomplete,
  ShouldCapture,
  Deletion
} from '../shared/ReactSideEffectTags'
import { traverseTwoPhase } from '../shared/ReactTreeTraversal'

const internalInstanceKey = '__reactInternalInstance'
const internalEventHandlersKey = '__reactEventHandlers'
const hostConfig = {
  now: () => {
    return performance.now()
  },
  shouldSetTextContent: (props) => {
    console.log('shouldSetTextContent')
    console.log('props: ', props)
    return typeof props.children === 'string' || typeof props.children === 'number'
  },
  createInstance: (type, props, internalInstanceHandle) => {
    console.log('createInstance')
    console.log('type: ', type)
    console.log('props: ', props)
    console.log('internalInstanceHandle: ', internalInstanceHandle)
    const domElement = document.createElement(type)
    domElement[internalInstanceKey] = internalInstanceHandle
    domElement[internalEventHandlersKey] = Object.keys(props).reduce((acc, curKey) => {
      if (registrationNames.includes(curKey)) {
        acc[curKey] = props[curKey]
      }
      return acc
    }, {})
    console.log('domElement: ', domElement)
    console.log('internalInstanceKey: ',  domElement[internalInstanceKey])
    console.log('internalEventHandlersKey: ',  domElement[internalEventHandlersKey])
    return domElement
  },
  finalizeInitialChildren: (domElement, props) => {
    //setInitialProperties(domElement, type, props, rootContainerInstance)
    console.log('finalizeInitialChildren')
    console.log('domElement: ', domElement)
    console.log('props: ', props)
    Object.keys(props).forEach(propKey => {
      const propValue = props[propKey];
      if (propKey === 'children') {
        if (typeof propValue === 'string' || typeof propValue === 'number') {
          domElement.textContent = propValue;
        }
      } else if (propKey === 'className') {
        domElement.setAttribute('class', propValue);
      } else if (registrationNames.includes(propKey)) {
        let eventType = propKey.slice(2).toLocaleLowerCase()
        if (eventType.endsWith('capture')) {
          eventType = eventType.slice(0, -7)
        }
        listenTo(eventType)
      } else {
        const propValue = props[propKey];
        domElement.setAttribute(propKey, propValue);
      }
    })
    // return false
  },
  appendInitialChild: (parentInstance, child) => {
    console.log('appendInitialChild')
    console.log('parentInstance: ', parentInstance)
    console.log('child: ', child)
    parentInstance.appendChild(child)
  },
  supportsMutation: true,
  appendChildToContainer: (container, child) => {
    console.log('appendChildToContainer')
    console.log('container: ', container)
    console.log('child: ', child)
    container.appendChild(child)
  },
  removeChildFromContainer: (container, child) => {
    console.log('removeChildFromContainer')
    console.log('container: ', container)
    console.log('child: ', child)
    container.removeChild(child)
  },
  scheduleDeferredCallback: (callback, options) => {
    console.log('scheduleDeferredCallback')
    requestIdleCallback(callback, options)
  },
  prepareUpdate: (oldProps, newProps) => {
    // return diffProperties(domElement, type, oldProps, newProps, rootContainerInstance)
    console.log('prepareUpdate')
    console.log('oldProps: ', oldProps)
    console.log('newProps: ', newProps)
    let updatePayload = null
    Object.keys(newProps).forEach(propKey => {
      let nextProp = newProps[propKey]
      let lastProp = oldProps[propKey]
      if (nextProp !== lastProp && (typeof nextProp === 'string' || typeof nextProp === 'number')) {
        (updatePayload = updatePayload || []).push(propKey, '' + nextProp)
      }
    })
    console.log('updatePayload: ', updatePayload)
    return updatePayload
  },
  commitUpdate: (domElement, updatePayload) => {
    console.log('commitUpdate')
    console.log('domElement: ', domElement)
    console.log('updatePayload: ', updatePayload)
    for (let i = 0; i < updatePayload.length; i += 2) {
      let propKey = updatePayload[i]
      let propValue = updatePayload[i + 1]
      domElement.textContent = propValue
    }
  }
}

const now = hostConfig.now
const shouldSetTextContent = hostConfig.shouldSetTextContent
const createInstance = hostConfig.createInstance
const finalizeInitialChildren = hostConfig.finalizeInitialChildren
const appendInitialChild = hostConfig.appendInitialChild
const scheduleDeferredCallback = hostConfig.scheduleDeferredCallback
const prepareUpdate = hostConfig.prepareUpdate
//mutation
const appendChildToContainer = hostConfig.appendChildToContainer
const removeChildFromContainer = hostConfig.removeChildFromContainer
const commitUpdate = hostConfig.commitUpdate



// Global Variables
let scheduledRoot = null //represents nextFlushedRoot and nextFlushedExpirationTime, need to be updated at some points!!!

let isRendering = false

let deadline = null
let deadlineDidExpire = false

let isBatchingInteractiveUpdates = false
let isBatchingUpdates = false
let isDispatchControlledEvent = false

let originalStartTimeMs = now()
let currentRendererTime = msToExpirationTime(originalStartTimeMs)
let currentSchedulerTime = currentRendererTime

let isWorking = false
let isCommitting = false

// The next work in progress fiber that we're currently working on.
let nextUnitOfWork = null

// The time at which we're currently rendering work.
let nextRenderExpirationTime = NoWork

// Should track side effects in reconcileChildren
let shouldTrackSideEffects = true

const timeHeuristicForUnitOfWork = 1

function createContainer (containerInfo) {
  console.log('createContainer')
  return createFiberRoot(containerInfo)
}

function updateContainer (element, container) {
  console.log('updateContainer')
  console.log('element: ', element)
  const current = container.current
  const currentTime = requestCurrentTime()
  const expirationTime = computeExpirationForFiber(currentTime)
  return scheduleRootUpdate(current, element, expirationTime)
}

function requestCurrentTime() {
  console.log('requestCurrentTime')
  // requestCurrentTime is called by the scheduler to compute an expiration
  // time.
  //
  // Expiration times are computed by adding to the current time (the start
  // time). However, if two updates are scheduled within the same event, we
  // should treat their start times as simultaneous, even if the actual clock
  // time has advanced between the first and second call.

  // In other words, because expiration times determine how updates are batched,
  // we want all updates of like priority that occur within the same event to
  // receive the same expiration time. Otherwise we get tearing.
  //
  // We keep track of two separate times: the current "renderer" time and the
  // current "scheduler" time. The renderer time can be updated whenever; it
  // only exists to minimize the calls performance.now.
  //
  // But the scheduler time can only be updated if there's no pending work, or
  // if we know for certain that we're not in the middle of an event.

  if (isRendering) {
    // We're already rendering. Return the most recently read time.
    return currentSchedulerTime
  }
  // Check if there's pending work.
  if (!scheduledRoot) {
    // If there's no pending work, or if the pending work is offscreen, we can
    // read the current time without risk of tearing.
    recomputeCurrentRendererTime()
    currentSchedulerTime = currentRendererTime;
    return currentSchedulerTime
  }
  // There's already pending work. We might be in the middle of a browser
  // event. If we were to read the current time, it could cause multiple updates
  // within the same event to receive different expiration times, leading to
  // tearing. Return the last read time. During the next idle callback, the
  // time will be updated.
  return currentSchedulerTime
}

function recomputeCurrentRendererTime () {
  console.log('recomputeCurrentRendererTime')
  // Subtract initial time so it fits inside 32bits
  let currentTimeMs = now() - originalStartTimeMs
  currentRendererTime = msToExpirationTime(currentTimeMs)
  console.log('currentRendererTime: ', currentRendererTime)
}

function computeExpirationForFiber (currentTime) {
  console.log('computeExpirationForFiber')
  let expirationTime
  if (isWorking) {
    if (isCommitting) {
      // Updates that occur during the commit phase should have sync priority by default.
      expirationTime = Sync
    } else {
      // Updates during the render phase should expire at the same time as 
      // the work that is being rendered.
      expirationTime = nextRenderExpirationTime
    }
  } else {
    if (isBatchingInteractiveUpdates) {
      // This is an interactive update
      expirationTime = computeInteractiveExpiration(currentTime);
    } else {
      // This is an async update
      expirationTime = computeAsyncExpiration(currentTime);
    }
  }
  console.log('expirationTime: ', expirationTime)
  return expirationTime;
}

function scheduleRootUpdate (current, element, expirationTime) {
  console.log('scheduleRootUpdate')
  const update = createUpdate()
  update.payload = {element}
  enqueueUpdate(current, update)
  scheduleWork(current, expirationTime)
  return expirationTime
}

// update fiber.current(.alternate).expirationTime and return the root
function scheduleWorkToRoot (fiber, expirationTime) {
  console.log('scheduleWorkToRoot')
  console.log('fiber: ', fiber)
  if (
    fiber.expirationTime === NoWork ||
    fiber.expirationTime > expirationTime
  ) {
    fiber.expirationTime = expirationTime
  }
  let alternate = fiber.alternate
  if (
    alternate !== null &&
    (alternate.expirationTime === NoWork ||
      alternate.expirationTime > expirationTime)
  ) {
    alternate.expirationTime = expirationTime
  }
  let node = fiber
  while (node !== null) {
    if (node.return === null && node.tag === HostRoot) {
      return node.stateNode
    }
    node = node.return
  }
  return null
  // ignore the update of parent's childExpirationTime
}

function scheduleWork (fiber, expirationTime) {
  console.log('scheduleWork')
  const root = scheduleWorkToRoot(fiber, expirationTime)
  root.expirationTime = expirationTime
  if (
    // If we're in the render phase, we don't need to schedule this root
    // for an update, because we'll do it before we exit...
    !isWorking ||
    isCommitting
  ) {
    requestWork(root, expirationTime)
  }
}

// function addRootToSchedule (root, expirationTime) {
//   console.log('addRootToSchedule')
//   console.log('root.expirationTime: ', root.expirationTime)
//   console.log('expirationTime: ', expirationTime)
//   if (!scheduledRoot) {
//     // This root is not already scheduled. Add it.
//     scheduledRoot = root
//     root.expirationTime = expirationTime
//   } else {
//     // This root is already scheduled, but its priority may have increased.
//     const remainingExpirationTime = root.expirationTime
//     if (remainingExpirationTime === NoWork || expirationTime < remainingExpirationTime) {
//       // Update the priority.
//       root.expirationTime = expirationTime
//     }
//   }
// }

function requestWork (root, expirationTime) {
  console.log('requestWork')
  console.log('root: ', root)
  console.log('isRendering: ', isRendering)
  console.log('isBatchingUpdates: ', isBatchingUpdates)
  console.log('expirationTime: ', expirationTime)
  scheduledRoot = root
  if (isRendering) {
    // Prevent reentrancy. Remaining work will be scheduled at the end of
    // the currently rendering batch.
    return
  }

  if (isBatchingUpdates) {
    // Flush work at the end of the batch.
    return
  }
  if (expirationTime === Sync) {
    performSyncWork()
  } {
    scheduleCallbackWithExpirationTime(root, expirationTime)
  }
}

function scheduleCallbackWithExpirationTime(root, expirationTime) {
  console.log('scheduleCallbackWithExpiration')
  const currentMs = now() - originalStartTimeMs;
  const expirationTimeMs = expirationTimeToMs(expirationTime);
  const timeout = expirationTimeMs - currentMs;
  scheduleDeferredCallback(performAsyncWork, {timeout});
}

function performSyncWork() {
  console.log('performSyncWork')
  performWork(null)
}

function performAsyncWork (dl) {
  console.log('performAsyncWork')
  performWork(dl)
}

function finishRendering () {
  console.log('finishRendering')
}

function performWork (dl) {
  console.log('performWork')
  deadline = dl;
  // Keep working on roots until there's no more work, or until we reach
  // the deadline.
  if (deadline !== null) {
    recomputeCurrentRendererTime()
    currentSchedulerTime = currentRendererTime
    while (
      scheduledRoot !== null &&
      (!deadlineDidExpire || currentRendererTime >= scheduledRoot.expirationTime)
    ) {
      performWorkOnRoot(
        scheduledRoot,
        currentRendererTime >= scheduledRoot.expirationTime
      )
      recomputeCurrentRendererTime()
      currentSchedulerTime = currentRendererTime
    }
  } else {
    while (scheduledRoot !== null) {
      performWorkOnRoot(scheduledRoot, true)
    }
  }
 
  // We're done flushing work. Either we ran out of time in this callback,
  // or there's no more work left with sufficient priority.
  // If there's work left over, schedule a new callback.
  if (scheduledRoot) {
    scheduleCallbackWithExpirationTime(
      scheduledRoot,
      scheduledRoot.expirationTime,
    );
  }

  // Clean-up.
  console.log('clearn up deadline and deadlineDidExpire')
  deadline = null;
  deadlineDidExpire = false;

  finishRendering()
}


function shouldYield () {
  console.log('shouldYield')
  console.log('deadlineDidExpire: ', deadlineDidExpire)
  console.log('deadline.timeRemaining: ', deadline.timeRemaining())
  if (deadlineDidExpire) {
    return true
  } 
  if (deadline === null || deadline.timeRemaining() > timeHeuristicForUnitOfWork) {
    // Disregard deadline.didTimeout. Only expired work should be flushed
    // during a timeout. This path is only hit for non-expired work.
    return false
  }
  deadlineDidExpire = true
  return true
}

function performWorkOnRoot(root, isExpired) {
  console.log('performWorkOnRoot')
  isRendering = true
  if (isExpired) {
    // Flush work without yielding.
    let finishedWork = root.finishedWork
    if (finishedWork !== null) {
      // This root is already complete. We can commit it.
      completeRoot(root, finishedWork)
    } else {
      root.finishedWork = null
      const isYieldy = false
      renderRoot(root, isYieldy)
      finishedWork = root.finishedWork
      if (finishedWork !== null) {
        // We've completed the root. Commit it.
        completeRoot(root, finishedWork)
      }
    }
  } else {
    // Flush async work.
    let finishedWork = root.finishedWork;
    if (finishedWork !== null) {
      // This root is already complete. We can commit it.
      completeRoot(root, finishedWork);
    } else {
      root.finishedWork = null
      const isYieldy = true
      renderRoot(root, isYieldy)
      finishedWork = root.finishedWork
      if (finishedWork !== null) {
        // We've completed the root. Check the deadline one more time
        // before committing.
        if (!shouldYield()) {
          // Still time left. Commit the root.
          completeRoot(root, finishedWork)
        } else {
          // There's no time left. Mark this root as complete. We'll come
          // back and commit it later.
          root.finishedWork = finishedWork
        }
      }
    }
  }
  isRendering = false
}

// This is used to create an alternate fiber to do work on.
function createWorkInProgress(current, pendingProps, expirationTime) {
  console.log('createWorkInProgress')
  let workInProgress = current.alternate
  if (workInProgress === null) {
    // We use a double buffering pooling technique because we know that we'll
    // only ever need at most two versions of a tree. We pool the "other" unused
    // node that we're free to reuse. This is lazily created to avoid allocating
    // extra objects for things that are never updated. It also allow us to
    // reclaim the extra memory if needed.
    workInProgress = new FiberNode(current.tag, pendingProps)
    workInProgress.type = current.type
    workInProgress.stateNode = current.stateNode
    workInProgress.alternate = current
    current.alternate = workInProgress
  } else {
    workInProgress.pendingProps = pendingProps

    // We already have an alternate.
    // Reset the effect tag.
    workInProgress.effectTag = NoEffect

    // The effect list is no longer valid.
    workInProgress.nextEffect = null
    workInProgress.firstEffect = null
    workInProgress.lastEffect = null
  }

  if (pendingProps !== current.pendingProps) {
    // This fiber has new props.
    workInProgress.expirationTime = expirationTime
  } else {
    // This fiber's props have not changed.
    workInProgress.expirationTime = current.expirationTime
  }

  workInProgress.child = current.child
  workInProgress.memoizedProps = current.memoizedProps
  workInProgress.memoizedState = current.memoizedState
  workInProgress.updateQueue = current.updateQueue

  // These will be overridden during the parent's reconciliation
  workInProgress.sibling = current.sibling

  return workInProgress
}

function retrySuspendedRoot (root, fiber) {
  console.log('retrySuspendedRoot')
  // Placeholder already timed out. Compute a new expiration time
  const currentTime = requestCurrentTime()
  const retryTime = computeExpirationForFiber(currentTime)
  root.expirationTime = retryTime
  scheduleWorkToRoot(fiber, retryTime)
  requestWork(root, root.expirationTime)
}

function throwException(root, returnFiber, sourceFiber, value, renderExpirationTime) {
  console.log('throwException')
  // The source fiber did not complete.
  sourceFiber.effectTag |= Incomplete
  // Its effect list is no longer valid.
  sourceFiber.firstEffect = sourceFiber.lastEffect = null
  if (
    value !== null &&
    typeof value === 'object' &&
    typeof value.then === 'function'
  ) {
    // This is a thenable.
    const thenable = value
    // Schedule the nearest Placeholder to re-render the timed out view
    let workInProgress = returnFiber
    do {
      if (workInProgress.tag === PlaceholderComponent) {
        const didTimeout = workInProgress.memoizedState
        if (!didTimeout) {
          // Found the nearest boundary.
          // Attach a listener to the promise to "ping" the root and retry
          const onResolveOrReject = retrySuspendedRoot.bind(
            null,
            root,
            workInProgress
          )
          console.log('thenable: ', thenable)
          thenable.then(onResolveOrReject, onResolveOrReject)
          workInProgress.effectTag |= ShouldCapture
          workInProgress.expirationTime = renderExpirationTime
          return
        }
      }
      workInProgress = workInProgress.return
    } while (workInProgress !== null)
  }
}

function renderRoot (root, isYieldy) {
  console.log('renderRoot')
  isWorking = true
  const expirationTime = root.expirationTime
  // Check if we're starting from a fresh stack, or if we're resuming from
  // previously yielded work.
  if (expirationTime !== nextRenderExpirationTime || nextUnitOfWork === null) {
    // Reset the stack and start working from the root.
    nextRenderExpirationTime = expirationTime
    nextUnitOfWork = createWorkInProgress(root.current, null, nextRenderExpirationTime)
  }
  do {
    try{
      workLoop(isYieldy)
    } catch (thrownValue) {
      console.log('thrownValue: ', thrownValue)
      console.log('nextUnitOfWork: ', nextUnitOfWork)
      const sourceFiber = nextUnitOfWork
      const returnFiber = sourceFiber.return
      throwException(root, returnFiber, sourceFiber, thrownValue, nextRenderExpirationTime)
      nextUnitOfWork = completeUnitOfWork(sourceFiber)
      continue
    }
    break
  } while (true)
  
  // workLoop(isYieldy)
  // We're done performing work. Time to clean up.
  isWorking = false
  if (nextUnitOfWork !== null) {
    // There's still remaining async work in this tree, but we ran out of time
    // in the current frame. Yield back to the renderer. Unless we're
    // interrupted by a higher priority update, we'll continue later from where
    // we left off.
    return
  }

  // We completed the whole tree.
  let rootWorkInProgress = root.current.alternate

  // Ready to commit.
  root.finishedWork = rootWorkInProgress
}

function workLoop (isYieldy) {
  console.log('workLoop')
  console.log('nextUnitOfWork: ', nextUnitOfWork)
  console.log('isYieldy', isYieldy)
  if (!isYieldy) {
    // Flush work without yielding
    while (nextUnitOfWork !== null) {
      nextUnitOfWork = performUnitOfWork(nextUnitOfWork)
    }
  } else {
    // Flush asynchronous work until the deadline runs out of time.
    while (nextUnitOfWork !== null && !shouldYield()) {
      nextUnitOfWork = performUnitOfWork(nextUnitOfWork)
    }
  }
}


function performUnitOfWork (workInProgress) {
  console.log('performUnitOfWork')
  const current = workInProgress.alternate
  let next = null
  next = beginWork(current, workInProgress, nextRenderExpirationTime)
  if (next === null) {
    // If this doesn't spawn new work, complete the current work.
    next = completeUnitOfWork(workInProgress)
  }
  console.log('next: ', next)
  return next
}

function beginWork (current, workInProgress, renderExpirationTime) {
  console.log('beginWork')
  console.log('workInProgress.tag: ', workInProgress.tag)
  // Before entering the begin phase, clear the expiration time.
  workInProgress.expirationTime = NoWork
  const Component = workInProgress.type
  const unresolvedProps = workInProgress.pendingProps
  switch (workInProgress.tag) {
    case ClassComponent: {
      return updateClassComponent(current, workInProgress, Component, unresolvedProps, renderExpirationTime)
    }
    case HostRoot: {
      return updateHostRoot(current, workInProgress, renderExpirationTime)
    }
    case HostComponent:{
      return updateHostComponent(current, workInProgress, renderExpirationTime)
    }
    case PlaceholderComponent:{
      return updatePlaceholderComponent(current, workInProgress, renderExpirationTime)
    }
    default:
      throw new Error('unknown unit of work tag') 
  }
}

function updatePlaceholderComponent (current, workInProgress, renderExpirationTime) {
  console.log('updatePlaceholderComponent')
  console.log('current: ', current)
  console.log('workInProgress: ', workInProgress)
  const nextProps = workInProgress.pendingProps
  // Check if we already attempted to render the normal state. If we did,
  // and we timed out, render the placeholder state.
  const alreadyCaptured = (workInProgress.effectTag & DidCapture) === NoEffect
  const nextDidTimeout = !alreadyCaptured
  if (nextDidTimeout) {
    // If the timed-out view commits, schedule an update effect to record
    // the committed time.
    workInProgress.effectTag |= Update
  } else {
    // The state node points to the time at which placeholder timed out.
    // We can clear it once we switch back to the normal children.
    workInProgress.stateNode = null
  }
  const nextChildren = nextDidTimeout ? nextProps.fallback : nextProps.children
  workInProgress.memoizedProps = nextProps
  workInProgress.memoizedState = nextDidTimeout
  reconcileChildren(current, workInProgress, nextChildren, renderExpirationTime)
  return workInProgress.child
}

/**
 * `ReactInstanceMap` maintains a mapping from a public facing stateful
 * instance (key) and the internal representation (value). This allows public
 * methods to accept the user facing instance as an argument and map them back
 * to internal methods.
 */

function get(key) {
  return key._reactInternalFiber
}

function set(key, value) {
  key._reactInternalFiber = value
}

const classComponentUpdater = {
  enqueueSetState: function (inst, payload) {
    console.log('enqueueSetState')
    const fiber = get(inst)
    const currentTime = requestCurrentTime()
    const expirationTime = computeExpirationForFiber(currentTime)
    const update = createUpdate()
    update.payload = payload
    enqueueUpdate(fiber, update)
    scheduleWork(fiber, expirationTime)
  }
}
function adoptClassInstance (workInProgress, instance) {
  console.log('adoptClassInstance')
  instance.updater = classComponentUpdater
  workInProgress.stateNode = instance
  // The instance needs access to the fiber so that it can schedule updates
  set(instance, workInProgress)
}

function constructClassInstance (workInProgress, ctor, props) {
  console.log('constructClassInstance')
  let instance =  new ctor(props)
  console.log('instance: ', instance)
  workInProgress.memoizedState = instance.state !== null && instance.state !== undefined ? instance.state : null
  adoptClassInstance(workInProgress, instance)
  return instance
}

function applyDerivedStateFromProps (workInProgress, getDerivedStateFromProps, nextProps) {
  console.log('applyDerivedStateFromProps')
  const prevState = workInProgress.memoizedState
  const partialState = getDerivedStateFromProps(nextProps, prevState)
  // Merge the partial state and the previous state.
  const memoizedState = partialState === null || partialState === undefined ? prevState : Object.assign({}, prevState, partialState)
  workInProgress.memoizedState = memoizedState
  // Once the update queue is empty, persist the derived state onto the
  // base state.
  const updateQueue = workInProgress.updateQueue
  if (updateQueue !== null && workInProgress.expirationTime === NoWork) {
    updateQueue.baseState = memoizedState
  }
}

// Invokes the mount life-cycles on a previously never rendered instance.
function mountClassInstance(workInProgress, ctor, newProps) {
  console.log('mountClassInstance')
  let instance = workInProgress.stateNode
  instance.props = newProps
  instance.state = workInProgress.memoizedState
  console.log('instance.state: ', instance.state)
  const updateQueue = workInProgress.updateQueue
  if (updateQueue !== null) {
    processUpdateQueue(workInProgress, updateQueue)
    instance.state = workInProgress.memoizedState
  }

  const getDerivedStateFromProps = ctor.getDerivedStateFromProps;
  if (typeof getDerivedStateFromProps === 'function') {
    applyDerivedStateFromProps(workInProgress, getDerivedStateFromProps, newProps);
    instance.state = workInProgress.memoizedState
  }
  //why
  if (typeof instance.componentDidMount === 'function') {
    workInProgress.effectTag |= Update
  }
}

function checkShouldComponentUpdate (workInProgress, newProps, newState) {
  const instance = workInProgress.stateNode
  if (typeof instance.shouldComponentUpdate === 'function') {
    const shouldUpdate = instance.shouldComponentUpdate(newProps, newState)
    return shouldUpdate
  }
  return true
}

// Invokes the update life-cycles and returns false if it shouldn't rerender.
function updateClassInstance (current, workInProgress, ctor, newProps) {
  console.log('updateClassInstance')
  const instance = workInProgress.stateNode
  const oldProps = workInProgress.memoizedProps
  instance.props = oldProps

  const getDerivedStateFromProps = ctor.getDerivedStateFromProps
  // Note: During these life-cycles, instance.props/instance.state are what
  // ever the previously attempted to render - not the "current". However,
  // during componentDidUpdate we pass the "current" props.

  const oldState = workInProgress.memoizedState
  let newState = instance.state = oldState
  let updateQueue = workInProgress.updateQueue
  if (updateQueue !== null) {
    processUpdateQueue(
      workInProgress,
      updateQueue
    )
    newState = workInProgress.memoizedState
  }
  if (oldProps === newProps && oldState === newState) {
    // If an update was already in progress, we should schedule an Update
    // effect even though we're bailing out, so that cWU/cDU are called.
    if (typeof instance.componentDidUpdate === 'function') {
      if (
        oldProps !== current.memoizedProps ||
        oldState !== current.memoizedState
      ) {
        workInProgress.effectTag |= Update
      }
    }
    if (typeof instance.getSnapshotBeforeUpdate === 'function') {
      if (
        oldProps !== current.memoizedProps ||
        oldState !== current.memoizedState
      ) {
        workInProgress.effectTag |= Snapshot
      }
    }
    return false
  }

  if (typeof getDerivedStateFromProps === 'function') {
    applyDerivedStateFromProps(
      workInProgress,
      getDerivedStateFromProps,
      newProps,
    )
    newState = workInProgress.memoizedState
  }

  const shouldUpdate = checkShouldComponentUpdate(
    workInProgress,
    newProps,
    newState
  )

  if (shouldUpdate) {
    if (typeof instance.componentDidUpdate === 'function') {
      workInProgress.effectTag |= Update;
    }
    if (typeof instance.getSnapshotBeforeUpdate === 'function') {
      workInProgress.effectTag |= Snapshot;
    }
  } else {
    // If an update was already in progress, we should schedule an Update
    // effect even though we're bailing out, so that cWU/cDU are called.
    if (typeof instance.componentDidUpdate === 'function') {
      if (
        oldProps !== current.memoizedProps ||
        oldState !== current.memoizedState
      ) {
        workInProgress.effectTag |= Update;
      }
    }
    if (typeof instance.getSnapshotBeforeUpdate === 'function') {
      if (
        oldProps !== current.memoizedProps ||
        oldState !== current.memoizedState
      ) {
        workInProgress.effectTag |= Snapshot;
      }
    }
    // If shouldComponentUpdate returned false, we should still update the
    // memoized props/state to indicate that this work can be reused.
    workInProgress.memoizedProps = newProps
    workInProgress.memoizedState = newState
  }
   // Update the existing instance's state, props, and context pointers even
  // if shouldComponentUpdate returns false.
  instance.props = newProps
  instance.state = newState

  return shouldUpdate
}

function updateClassComponent (current, workInProgress, Component, nextProps, renderExpirationTime) {
  console.log('updateClassComponent')
  console.log('workInProgress.memoizedState: ', workInProgress.memoizedState)
  let shouldUpdate
  if (current === null) {
    // In the initial pass we might need to construct the instance. //ignored resume
    constructClassInstance(workInProgress, Component, nextProps)
    mountClassInstance(workInProgress, Component, nextProps)
    shouldUpdate = true
  } else {
    shouldUpdate = updateClassInstance(current, workInProgress, Component, nextProps)
  }
  return finishClassComponent(current, workInProgress, shouldUpdate, renderExpirationTime)
}

function cloneChildFibers(workInProgress) {
  console.log('cloneChildFibers')
  if (workInProgress.child === null) {
    return
  }

  let currentChild = workInProgress.child
  let newChild = createWorkInProgress(currentChild, currentChild.pendingProps, currentChild.expirationTime);
  workInProgress.child = newChild

  newChild.return = workInProgress
  while (currentChild.sibling !== null) {
    currentChild = currentChild.sibling
    newChild = newChild.sibling = createWorkInProgress(currentChild, currentChild.pendingProps, currentChild.expirationTime);
    newChild.return = workInProgress
  }
  newChild.sibling = null
}

function finishClassComponent (current, workInProgress, shouldUpdate, renderExpirationTime) {
  console.log('finishClassComponent')
  if (!shouldUpdate) {
    cloneChildFibers(workInProgress)
  } else {
    const instance = workInProgress.stateNode
    console.log('instance: ', instance)
    const nextChildren = instance.render();
    console.log('nextChildren: ', nextChildren)
    reconcileChildren(current, workInProgress, nextChildren, renderExpirationTime)
    // Memoize props and state using the values we just used to render.
    // TODO: Restructure so we never read values from the instance.
    memoizeState(workInProgress, instance.state)
    memoizeProps(workInProgress, instance.props)
  }
  return workInProgress.child
}

function reconcileChildren (current, workInProgress, nextChildren, renderExpirationTime) {
  console.log('reconcileChildren')
  console.log('current: ', current)
  console.log('nextChildren', nextChildren)
  if (current === null) {
    // If this is a fresh new component that hasn't been rendered yet, we
    // won't update its child set by applying minimal side-effects. Instead,
    // we will add them all to the child before it gets rendered. That means
    // we can optimize this reconciliation pass by not tracking side-effects.
    shouldTrackSideEffects = false
    workInProgress.child = reconcileChildFibers(workInProgress, null, nextChildren, renderExpirationTime);
  } else {
    // If the current child is the same as the work in progress, it means that
    // we haven't yet started any work on these children. Therefore, we use
    // the clone algorithm to create a copy of all the current children.

    // If we had any progressed work already, that is invalid at this point so
    // let's throw it out.
    shouldTrackSideEffects = true
    workInProgress.child = reconcileChildFibers(workInProgress, current.child, nextChildren, renderExpirationTime);
  }
}

// This API will tag the children with the side-effect of the reconciliation
// itself. They will be added to the side-effect list as we pass through the
// children and the parent.
function reconcileChildFibers(returnFiber, currentFirstChild, newChild, expirationTime) {
  console.log('reconcileChildFibers')
  console.log('newChild: ', newChild)
  if (newChild) {
    const childArray = Array.isArray(newChild) ? newChild : [newChild]
    return reconcileChildrenArray(returnFiber, currentFirstChild, childArray, expirationTime)
  } else {
    return null
  }
}


function createFiberFromElement (element, expirationTime) {
  console.log('createFiberFromElement')
  let fiber
  const type = element.type
  const pendingProps = element.props
  let fiberTag
  if (typeof type === 'function') {
    fiberTag = ClassComponent
  } else if (typeof type === 'string') {
    fiberTag = HostComponent
  } else {
    fiberTag = PlaceholderComponent
  }
  fiber = new FiberNode(fiberTag, pendingProps)
  fiber.type = type
  fiber.expirationTime = expirationTime
  console.log('fiber: ', fiber)
  return fiber
}

function useFiber (fiber, pendingProps, expirationTime) {
  let clone = createWorkInProgress(fiber, pendingProps, expirationTime)
  clone.sibling = null
  return clone
}
function createChild (returnFiber, newChild, expirationTime) {
  console.log('createChild')
  if (typeof newChild === 'object' && newChild !== null) {
    let created = createFiberFromElement(newChild, expirationTime)
    created.return = returnFiber
    return created
  }
  return null
}

function updateElement (returnFiber, current, element, expirationTime) {
  console.log('updateElement')
  if (current !== null && current.type === element.type) {
    // Update
    const existing = useFiber(current, element.props, expirationTime)
    existing.return = returnFiber
    return existing
  } else {
    // Insert
    const created = createFiberFromElement(element, expirationTime)
    created.return = returnFiber
    return created
  } 
}

function updateSlot (returnFiber, oldFiber, newChild, expirationTime) {
  console.log('updateSlot')
  if (typeof newChild === 'object' && newChild !== null) {
    return updateElement(returnFiber, oldFiber, newChild, expirationTime)
  }
  return null
}

function deleteChild (returnFiber, childToDelete) {
  // Deletions are added in reversed order so we add it to the front.
  // At this point, the return fiber's effect list is empty except for
  // deletions, so we can just append the deletion to the list. The remaining
  // effects aren't added until the complete phase. Once we implement
  // resuming, this may not be true.
  const last = returnFiber.lastEffect
  if (last !== null) {
    last.nextEffect = childToDelete
    returnFiber.lastEffect = childToDelete
  } else {
    returnFiber.firstEffect = returnFiber.lastEffect = childToDelete
  }
  childToDelete.nextEffect = null
  childToDelete.effectTag = Deletion
}

function reconcileChildrenArray (returnFiber, currentFirstChild, newChildren, expirationTime) {
  console.log('reconcileChildrenArray')
  let resultingFirstChild = null
  let previousNewFiber = null
  let oldFiber = currentFirstChild
  let newIdx = 0
  for (; oldFiber !== null && newIdx < newChildren.length; newIdx ++) {
    let newFiber = updateSlot(returnFiber, oldFiber, newChildren[newIdx], expirationTime)
    if (shouldTrackSideEffects) {
      if (oldFiber && newFiber.alternate === null) {
        // We matched the slot, but we didn't reuse the existing fiber, so we
        // need to delete the existing child.
        deleteChild(returnFiber, oldFiber)
        newFiber.effectTag = Placement
      }
    }
    if (resultingFirstChild === null) {
      resultingFirstChild = newFiber
    } else {
      previousNewFiber.sibling = newFiber
    }
    previousNewFiber = newFiber
    oldFiber = oldFiber.sibling
  }
 
  if (oldFiber === null) {
    for (; newIdx < newChildren.length; newIdx++) {
      let _newFiber = createChild(returnFiber, newChildren[newIdx], expirationTime)
      if (shouldTrackSideEffects && _newFiber.alternate === null) {
        console.log('markPlacement')
        _newFiber.effectTag = Placement
      }     
      console.log('_newFiber: ', _newFiber)
      if (resultingFirstChild === null) {
        resultingFirstChild = _newFiber
      } else {
        previousNewFiber.sibling = _newFiber
      }
      previousNewFiber = _newFiber
    }
    return resultingFirstChild
  }
}

// TODO: Delete memoizeProps/State and move to reconcile/bailout instead
function memoizeProps(workInProgress, nextProps) {
  workInProgress.memoizedProps = nextProps
}

function memoizeState(workInProgress, nextState) {
  workInProgress.memoizedState = nextState
  // Don't reset the updateQueue, in case there are pending updates. Resetting
  // is handled by processUpdateQueue.
}

function updateHostRoot (current, workInProgress, renderExpirationTime) {
  console.log('updateHostRoot')
  console.log('workInProgress: ', workInProgress)
  const updateQueue = workInProgress.updateQueue
  const prevState = workInProgress.memoizedState
  const prevChildren = prevState !== null ? prevState.element : null
  processUpdateQueue(workInProgress, updateQueue)
  const nextState = workInProgress.memoizedState
  const nextChildren = nextState.element
  if (nextChildren === prevChildren) {
    console.log('when update')
    // If the state is the same as before, that's a bailout because we had
    // no work that expires at this time.
    cloneChildFibers(workInProgress)
    return workInProgress.child
  }
  reconcileChildren(current, workInProgress, nextChildren, renderExpirationTime)
  console.log('workInProgress.child: ', workInProgress.child)
  return workInProgress.child
}

function updateHostComponent (current, workInProgress, renderExpirationTime) {
  console.log('updateHostComponent')
  console.log('workInProgress: ', workInProgress)
  const nextProps = workInProgress.pendingProps
  let nextChildren = nextProps.children
  const isDirectTextChild = shouldSetTextContent(nextProps)
  if (isDirectTextChild) {
    // We special case a direct text child of a host node. This is a common
    // case. We won't handle it as a reified child. We will instead handle
    // this in the host environment that also have access to this prop. That
    // avoids allocating another HostText fiber and traversing it.
    nextChildren = null
  }
  reconcileChildren(current, workInProgress, nextChildren, renderExpirationTime)
  memoizeProps(workInProgress, nextProps)
  return workInProgress.child
}

function markUpdate(workInProgress) {
  // Tag the fiber with an update effect. This turns a Placement into
  // a PlacementAndUpdate.
  workInProgress.effectTag |= Update;
}  

function appendAllChildren (parent, workInProgress) {
  console.log('appendAllChildren')
  // We only have the top Fiber that was created but we need recurse down its
  // children to find all the terminal nodes.
  let node = workInProgress.child
  while (node !== null) {
    if (node.tag === HostComponent) {
      appendInitialChild(parent, node.stateNode);
    } else if (node.child !== null) {
      node.child.return = node
      node = node.child
      continue
    }
    if (node ===  workInProgress) {
      return
    }
    while (node.sibling === null) {
      if (node.return === null || node.return === workInProgress) {
        return
      }
      node = node.return
    }
    node.sibling.return = node.return
    node = node.sibling
  }
}

function completeWork (current, workInProgress) {
  console.log('completeWork')
  console.log('current: ', current)
  console.log('workInProgress.tag: ', workInProgress.tag)
  const newProps = workInProgress.pendingProps
  switch(workInProgress.tag) {
    case ClassComponent: {
      break
    }
    case HostRoot: {
      break
    }
    case HostComponent: {
      const type = workInProgress.type
      if (current !== null && workInProgress.stateNode != null) {
        // If we have an alternate, that means this is an update and we need to
        // schedule a side-effect to do the updates.
        console.log('current: ', current)
        console.log('workInProgress.stateNode: ', workInProgress.stateNode)
        const oldProps = current.memoizedProps
        if (oldProps !== newProps) {
          const updatePayload = prepareUpdate(oldProps, newProps)
          console.log('updatePayloa: ', updatePayload)
          workInProgress.updateQueue = updatePayload
          // If the update payload indicates that there is a change or if there
          // is a new ref we mark this as an update. All the work is done in commitWork.
          if (updatePayload ) {
            console.log('markUpdate')
            markUpdate(workInProgress)
          }
        }
      } else {
        //initial pass
        const _instance = createInstance(type, newProps, workInProgress)
        appendAllChildren(_instance, workInProgress)
        finalizeInitialChildren(_instance, newProps)
        workInProgress.stateNode = _instance
      }
      break
    }
    case PlaceholderComponent: {
      break
    } 
    default: {
      throw new Error('Unknown unit of work tag')
    }
  }
  return null
}

function unwindWork (workInProgress) {
  switch (workInProgress.tag) {
    case PlaceholderComponent: {
      const effectTag = workInProgress.effectTag
      if (effectTag & ShouldCapture) {
        workInProgress.effectTag = (effectTag & ~ShouldCapture) | DidCapture
        return workInProgress
      }
      return null
    }
    default: {
      return null
    }
  }
}

function completeUnitOfWork (workInProgress) {
  console.log('completeUnitOfWork')
  console.log('workInProgress: ', workInProgress)
  // Attempt to complete the current unit of work, then move to the
  // next sibling. If there are no more siblings, return to the
  // parent fiber.
  while (true) {
    const current = workInProgress.alternate
    const returnFiber = workInProgress.return
    const siblingFiber = workInProgress.sibling
    if ((workInProgress.effectTag & Incomplete) === NoEffect) {
      // This fiber completed.
      completeWork(current, workInProgress)
      console.log('after completeWork, workInProgress: ', workInProgress)
      if (returnFiber !== null &&
        // Do not append effects to parents if a sibling failed to complete
        (returnFiber.effectTag & Incomplete) === NoEffect) {
          // Append all the effects of the subtree and this fiber onto the effect
          // list of the parent. The completion order of the children affects the
          // side-effect order.
          if (returnFiber.firstEffect === null) {
            returnFiber.firstEffect = workInProgress.firstEffect
          }
          if (workInProgress.lastEffect !== null) {
            if (returnFiber.lastEffect !== null) {
              returnFiber.lastEffect.nextEffect = workInProgress.firstEffect
            }
            returnFiber.lastEffect = workInProgress.lastEffect
          }

          // If this fiber had side-effects, we append it AFTER the children's
          // side-effects. We can perform certain side-effects earlier if
          // needed, by doing multiple passes over the effect list. We don't want
          // to schedule our own side-effect on our own list because if end up
          // reusing children we'll schedule this effect onto itself since we're
          // at the end.
          const effectTag = workInProgress.effectTag
          // Skip both NoWork and PerformedWork tags when creating the effect list.
          // PerformedWork effect is read by React DevTools but shouldn't be committed.
          if (effectTag > PerformedWork) {
            if (returnFiber.lastEffect !== null) {
              returnFiber.lastEffect.nextEffect = workInProgress
            } else {
              returnFiber.firstEffect = workInProgress
            }
            returnFiber.lastEffect = workInProgress
          }
        }

      if (siblingFiber !== null) {
        // If there is more work to do in this returnFiber, do that next.
        console.log('return siblingFiber: ', siblingFiber)
        return siblingFiber;
      } else if (returnFiber !== null) {
        // If there's no more work in this returnFiber. Complete the returnFiber.
        workInProgress = returnFiber
        continue
      } else {
        // We've reached the root.
        return null
      }
    } else {
      // This fiber did not complete because something threw. Pop values off
      // the stack without entering the complete phase. If this is a boundary,
      // capture values if possible.
      const next = unwindWork(workInProgress)
      if (next !== null) {
        // If completing this work spawned new work, do that next. We'll come
        // back here again
        // Since we're restarting, remove anything that is not a host effect
        // from the effect tag.
        next.effectTag &= HostEffectMask
        return next
      }
      if (returnFiber !== null) {
        // Mark the parent fiber as incomplete and clear its effect list.
        returnFiber.firstEffect = returnFiber.lastEffect = null
        returnFiber.effectTag |= Incomplete
      }
      if (siblingFiber !== null) {
        // If there is more work to do in this returnFiber, do that next.
        return siblingFiber
      } else if (returnFiber !== null) {
        // If there's no more work in this returnFiber. Complete the returnFiber.
        workInProgress = returnFiber
        continue
      } else {
        return null
      }
    }
  }
}

function completeRoot(root, finishedWork) {
  console.log('completeRoot')
  root.finishedWork = null
  commitRoot(root, finishedWork)
  scheduledRoot = null
}

function getHostParentFiber(fiber) {
  let parent = fiber.return
  while (parent !== null) {
    if (isHostParent(parent)) {
      return parent;
    }
    parent = parent.return;
  }
}

function isHostParent(fiber) {
  return fiber.tag === HostComponent || fiber.tag === HostRoot;
}

function commitPlacement (finishedWork) {
  console.log('commitPlacement')
  console.log('finishedWork: ', finishedWork)
  // Recursively insert all host nodes into the parent.
  const parentFiber = getHostParentFiber(finishedWork)
  // We only have the top Fiber that was inserted but we need recurse down its
  // children to find all the terminal nodes.
  const parent = parentFiber.tag === HostRoot ? parentFiber.stateNode.containerInfo : parentFiber.stateNode
  let node = finishedWork
  while (true) {
    if (node.tag === HostComponent) {
      appendChildToContainer(parent, node.stateNode)
    } else if (node.child !== null) {
      node.child.return = node
      node = node.child
      continue
    }
    if (node === finishedWork) {
      return
    }
    while (node.sibling === null) {
      if (node.return === null || node.return === finishedWork) {
        return;
      }
      node = node.return;
    }
    node.sibling.return = node.return
    node = node.sibling
  }
}

function commitWork (finishedWork) {
  console.log('commitWork')
  switch (finishedWork.tag) {
    case HostRoot: 
    case ClassComponent: {
      return
    }
    case HostComponent: {
      console.log('HostComponent')
      const instance = finishedWork.stateNode
      if (instance != null) {
        // Commit the work prepared earlier.
        const updatePayload = finishedWork.updateQueue
        finishedWork.updateQueue = null
        if (updatePayload !== null) {
          commitUpdate(instance, updatePayload)
        }
      }
      return
    }
    case PlaceholderComponent: {
      return
    }
    default: {
      throw new Error('This unit of work tag should not have side-effects')
    }
  }
}

function commitDeletion (current) {
  console.log('commitDeletion')
  // Recursively delete all host nodes from the parent.
  // Detach refs and call componentWillUnmount() on the whole subtree.
  const parentFiber = getHostParentFiber(current)
  // We only have the top Fiber that was deleted but we need recurse down its
  // children to find all the terminal nodes.
  const parent = parentFiber.tag === HostRoot ? parentFiber.stateNode.containerInfo : parentFiber.stateNode
  let node = current
  while (true) {
    if (node.tag === HostComponent) {
      // ignored unmount the children of the node, it is not safe, because children may contain ClassComponent,
      // which should call componentWillUnmount() if needed
      removeChildFromContainer(parent, node.stateNode) 
    } else {
      //ClassComponent, call componentWillUnmount()
      const instance = node.stateNode
      if (typeof instance.componentWillUnmount === 'function') {
        instance.props = node.memoizedProps;
        instance.state = node.memoizedState;
        instance.componentWillUnmount()
      }
      if (node.child !== null) {
        node.child.return = node
        node = node.child
        continue
      }
    }
    if (node === current) {
      return
    }
    while (node.sibling === null) {
      if (node.return === null || node.return === current) {
        return
      }
      node = node.return
    }
    node.sibling.return = node.return
    node = node.sibling
  }
  // Cut off the return pointers to disconnect it from the tree. Ideally, we
  // should clear the child pointer of the parent alternate to let this
  // get GC:ed but we don't know which for sure which parent is the current
  // one so we'll settle for GC:ing the subtree of this child. This child
  // itself will be GC:ed when the parent updates the next time.
  current.return = null
  current.child = null
  if (current.alternate) {
    current.alternate.child = null;
    current.alternate.return = null;
  }
}

function commitAllHostEffects (firstEffect) {
  console.log('commitAllHostEffects')
  let nextEffect = firstEffect
  while (nextEffect !== null) {
    const effectTag = nextEffect.effectTag
    console.log('effectTag: ', effectTag & (Placement | Update | Deletion))
    switch(effectTag & (Placement | Update | Deletion)) {
      case Placement: {
        commitPlacement(nextEffect)
        // Clear the "placement" from effect tag so that we know that this is inserted, before
        // any life-cycles like componentDidMount gets called.
        // TODO: findDOMNode doesn't rely on this any more but isMounted
        // does and isMounted is deprecated anyway so we should be able
        // to kill this.
        nextEffect.effectTag &= ~Placement
        break
      }
      case Update: {
        commitWork(nextEffect)
        break
      }
      case Deletion: {
        commitDeletion(nextEffect)
        break
      }
    }
    nextEffect = nextEffect.nextEffect;
  }    
}

function commitBeforeMutationLifecycles (firstEffect, finishedWork) {
  console.log('commitBeforeMutationLifecycles')
  let nextEffect = firstEffect 
  while (nextEffect !== null) {
    const effectTag = nextEffect.effectTag
    if (effectTag & Snapshot) {
      const current = nextEffect.alternate
      const prevProps = current.memoizedProps
      const prevState = current.memoizedState
      let instance = nextEffect.stateNode
      instance.props = finishedWork.memoizedProps
      instance.state = finishedWork.memoizedState
      const snapshot = instance.getSnapshotBeforeUpdate(prevProps, prevState)
      instance.__reactInternalSnapshotBeforeUpdate = snapshot
    }
    nextEffect = nextEffect.nextEffect
  }
}

function commitAllLifeCycles(firstEffect) {
  let nextEffect = firstEffect 
  while(nextEffect !== null) {
    const effectTag = nextEffect.effectTag
    if (effectTag & Update) {
      const current = nextEffect.alternate
      commitLifeCycles(current, nextEffect)
    }
    nextEffect = nextEffect.nextEffect
  }
}

function commitLifeCycles (current, finishedWork) {
  console.log('commitLifeCycles')
  switch (finishedWork.tag) {
    case ClassComponent: {
      const instance = finishedWork.stateNode
      if (finishedWork.effectTag & Update) {
        if (current === null) {
          instance.props = finishedWork.memoizedProps
          instance.state = finishedWork.memoizedState
          instance.componentDidMount()
        } else {
          const prevProps = current.memoizedProps
          const prevState = current.memoizedState
          instance.props = finishedWork.memoizedProps
          instance.state = finishedWork.memoizedState
          instance.componentDidUpdate(prevProps, prevState, instance.__reactInternalSnapshotBeforeUpdate)
        }
      }
    }
    case HostRoot:
    case HostComponent:{
      return
    }
    case PlaceholderComponent: {
      return
    }
    default: {
      throw new Error('This unit of work tag should not have side-effects.')
    }
  }
}

function commitRoot(root, finishedWork) {
  console.log('before commitRoot, root: ', root)
  console.log('finishedWork: ', finishedWork)
  console.log('commitRoot')
  isWorking = true;
  isCommitting = true
  // Assume there's no remaining work.
  root.expirationTime = NoWork
  // Assume there is no effect on the root.
  const firstEffect = finishedWork.firstEffect;
  console.log('firstEffect: ', firstEffect)
  // Invoke instances of getSnapshotBeforeUpdate before mutation
  commitBeforeMutationLifecycles(firstEffect, finishedWork)
  // Commit all the side-effects within a tree. We'll do this in two passes.
  // The first pass performs all the host insertions, updates, deletions and
  // ref unmounts.
  commitAllHostEffects(firstEffect)
  // The work-in-progress tree is now the current tree. This must come after
  // the first pass of the commit phase, so that the previous tree is still
  // current during componentWillUnmount, but before the second pass, so that
  // the finished work is current during componentDidMount/Update.
  root.current = finishedWork
  // In the second pass we'll perform all life-cycles and ref callbacks.
  // Life-cycles happen as a separate pass so that all placements, updates,
  // and deletions in the entire tree have already been invoked.
  // This pass also triggers any renderer-specific initial effects.
  commitAllLifeCycles(firstEffect)
  isCommitting = false;
  isWorking = false;
}

function dispatchEventWithBatch (nativeEvent) {
  console.log('dispatchEventWithBatch')
  console.log('nativeEvent.type: ', nativeEvent.type)
  const type = nativeEvent.type
  let previousIsBatchingInteractiveUpdates = isBatchingInteractiveUpdates
  let previousIsBatchingUpdates = isBatchingUpdates
  let previousIsDispatchControlledEvent = isDispatchControlledEvent
  if (type === 'change') {
    isDispatchControlledEvent = true
  }
  if (isInteractiveEvent(type)) {
    isBatchingInteractiveUpdates = true
  }
  isBatchingUpdates = true
  
  try {
    return dispatchEvent(nativeEvent) // why should we return a void func
  } finally {
    console.log('before leaving event handler')
    isBatchingInteractiveUpdates = previousIsBatchingInteractiveUpdates
    isBatchingUpdates = previousIsBatchingUpdates
    if (!isBatchingUpdates && !isRendering) {
      if (isDispatchControlledEvent) {
        //performSyncWork
        isDispatchControlledEvent = previousIsDispatchControlledEvent
        if (scheduledRoot) { // if event triggers update
          performSyncWork()
        }  
      } else {
        //performAysncWork
        if (scheduledRoot) {
          scheduleCallbackWithExpirationTime(scheduledRoot, scheduledRoot.expirationTime)
        }
      }
    }
  }
}

function dispatchEvent (nativeEvent) {
  console.log('dispatchEvent')
  let listeners = []
  const nativeEventTarget = nativeEvent.target || nativeEvent.srcElement
  const targetInst = nativeEventTarget[internalInstanceKey]
  traverseTwoPhase(targetInst, accumulateDirectionalDispatches.bind(null, listeners), nativeEvent)
  console.log('listeners: ', listeners)
  listeners.forEach(listener => listener(nativeEvent))
}

function accumulateDirectionalDispatches (acc, inst, phase, nativeEvent) {
  let type = nativeEvent.type
  let registrationName = 'on' + type[0].toLocaleUpperCase() + type.slice(1)
  if (phase === 'captured') {
    registrationName = registrationName + 'Capture'
  }
  const stateNode = inst.stateNode
  const props = stateNode[internalEventHandlersKey]
  const listener = props[registrationName]
  if (listener) {
    acc.push(listener)
  }
}

function listenTo (eventType) {
  console.log('listenTo')
  document.addEventListener(eventType, dispatchEventWithBatch)
}

export {
  createContainer,
  updateContainer
}