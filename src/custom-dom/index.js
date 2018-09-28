import * as customRenderer from '../reconciler/Reconciler'

const CustomDom = {
  render: (reactElement, container) => {
    console.log(container)
    let root = container._reactRootContainer
    if (!root) {
      // initial mount
      root = container._reactRootContainer = customRenderer.createContainer(container)
      console.log(root)
    }
    customRenderer.updateContainer(reactElement, root)
  }
};

export default CustomDom