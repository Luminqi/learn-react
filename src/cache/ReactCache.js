export function createCache () {
  const resourceMap = new Map()
  const cache = {
    read (resourceType, key, loadResource) {
      let recordCache = resourceMap.get(resourceType)
      if (recordCache === undefined) {
        recordCache = new Map()
        resourceMap.set(resourceType, recordCache)
      }
      let record = recordCache.get(key)
      if (record === undefined) {
        const suspender = loadResource(key)
        suspender.then(value => {
          recordCache.set(key, value)
          return value
        })
        throw suspender
      }
      return record
    }
  }
  return cache
}

export function createResource (loadResource) {
  const resource = {
    read (cache, key) {
      return cache.read(resource, key, loadResource)
    }
  }
  return resource
}