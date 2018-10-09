import ReactReconciler from './reconciler/Reconciler'
// import ReactReconciler from 'react-reconciler'

const hostConfig = {
  now: () => {
    return performance.now
  },
  shouldSetTextContent: (props) => {
    return typeof props.children === 'string' || typeof props.children === 'number'
  },
  createInstance: (type) => {
    const domElement = document.createElement(type)
    return domElement
  },
  finalizeInitialChildren: (domElement, props) => {
    Object.keys(props).forEach(propKey => {
      const propValue = props[propKey]
      if (propKey === 'children') {
        if (typeof propValue === 'string' || typeof propValue === 'number') {
          domElement.textContent = propValue
        }
      } else if (propKey === 'className') {
        domElement.setAttribute('class', propValue)
      } else if (propKey === 'onClick') {
        domElement.addEventListener('click', propValue)
      } else {
        const propValue = props[propKey]
        domElement.setAttribute(propKey, propValue)
      }
    })
    return false
  },
  appendInitialChild: (parentInstance, child) => {
    parentInstance.appendChild(child)
  },
  appendChildToContainer: (container, child) => {
    container.appendChild(child)
  },
  scheduleDeferredCallback: (callback, options) => {
    requestIdleCallback(callback, options)
  },
  prepareUpdate: (oldProps, newProps) => {
    let updatePayload = null
    Object.keys(newProps).forEach(propKey => {
      let nextProp = newProps[propKey]
      let lastProp = oldProps[propKey]
      if (nextProp !== lastProp && (typeof nextProp === 'string' || typeof nextProp === 'number')) {
        (updatePayload = updatePayload || []).push(propKey, '' + nextProp)
      }
    })
    return updatePayload
  },
  commitUpdate: (domElement, updatePayload) => {
    for (let i = 0; i < updatePayload.length; i += 2) {
      let propKey = updatePayload[i]
      let propValue = updatePayload[i + 1]
      domElement.textContent = propValue
    }
  }
}

const customRenderer = ReactReconciler(hostConfig)

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

