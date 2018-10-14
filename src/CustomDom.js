import ReactReconciler from './reconciler/Reconciler'
// import ReactReconciler from 'react-reconciler'
import { registrationNames } from './event/isInteractiveEvent'

let customRenderer

const hostConfig = {
  now: () => {
    return performance.now
  },
  shouldSetTextContent: (props) => {
    return typeof props.children === 'string' || typeof props.children === 'number'
  },
  createInstance: (type, props, internalInstanceHandle) => {
    const domElement = document.createElement(type)
    domElement.internalInstanceKey = internalInstanceHandle
    domElement.internalEventHandlersKey = props
    return domElement
  },
  finalizeInitialChildren: (domElement, props) => {
    Object.keys(props).forEach(propKey => {
      const propValue = props[propKey]
      if (propKey === 'children') {
        if (typeof propValue === 'string' || typeof propValue === 'number') {
          domElement.textContent = propValue
        }
      } else if (propKey === 'style') {
        const style = domElement.style
        Object.keys(propValue).forEach(styleName => {
          let styleValue = propValue[styleName]
          style.setProperty(styleName, styleValue)
        })
      } else if (propKey === 'className') {
        domElement.setAttribute('class', propValue)
      } else if (registrationNames.includes(propKey) || propKey === 'onChange') {
        let eventType = propKey.slice(2).toLocaleLowerCase()
        if (eventType.endsWith('capture')) {
          eventType = eventType.slice(0, -7)
        }
        document.addEventListener(eventType, customRenderer.dispatchEventWithBatch)
      } else {
        const propValue = props[propKey]
        domElement.setAttribute(propKey, propValue)
      }
    })
  },
  appendInitialChild: (parentInstance, child) => {
    parentInstance.appendChild(child)
  },
  appendChildToContainer: (container, child) => {
    container.appendChild(child)
  },
  removeChildFromContainer: (container, child) => {
    container.removeChild(child)
  },
  scheduleDeferredCallback: (callback, options) => {
    requestIdleCallback(callback, options)
  },
  prepareUpdate: (oldProps, newProps) => {
    let updatePayload = null
    let styleUpdates = null
    Object.keys(newProps).forEach(propKey => {
      let nextProp = newProps[propKey]
      let lastProp = oldProps[propKey]
      if (nextProp !== lastProp && (typeof nextProp === 'string' || typeof nextProp === 'number')) {
        (updatePayload = updatePayload || []).push(propKey, '' + nextProp)
      }
      if (propKey === 'style') {
        for (let styleName in nextProp) {
          if (nextProp.hasOwnProperty(styleName) && lastProp[styleName] !== nextProp[styleName]) {
            styleUpdates = nextProp
            break
          }
        }
        if (styleUpdates) {
          (updatePayload = updatePayload || []).push(propKey, styleUpdates)
        }
      }
    })
    return updatePayload
  },
  commitUpdate: (domElement, updatePayload) => {
    for (let i = 0; i < updatePayload.length; i += 2) {
      let propKey = updatePayload[i]
      let propValue = updatePayload[i + 1]
      if (propKey === 'children') {
        domElement.textContent = propValue
      } else if (propKey === 'style'){
        const style = domElement.style
        Object.keys(propValue).forEach(styleName => {
          let styleValue = propValue[styleName]
          style.setProperty(styleName, styleValue)
        })
      } else {
        domElement[propKey] = propValue
      }
    }
  }
}

customRenderer = ReactReconciler(hostConfig)

export const CustomDom = {
  render: (reactElement, container) => {
    let root = container._reactRootContainer
    if (!root) {
      // initial mount
      const isConcurrent = true // concurrent mode
      root = container._reactRootContainer = customRenderer.createContainer(container, isConcurrent)
    }
    customRenderer.updateContainer(reactElement, root)
  }
}

