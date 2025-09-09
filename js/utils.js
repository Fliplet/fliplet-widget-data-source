/**
 * Native JavaScript utilities to replace lodash methods
 * These functions provide equivalent functionality to commonly used lodash methods
*/

window.FlipletDSUtils = {
  /**
   * Safely get a nested property from an object
   * Replacement for _.get()
   * @param {Object} obj - The object to query
   * @param {string|Array} path - The path to the property (dot notation string or array of keys)
   * @param {*} [defaultValue] - The value returned if the path is not found
   * @returns {*} The resolved value or defaultValue
   */
  get: function(obj, path, defaultValue) {
    if (!obj || typeof obj !== 'object') {
      return defaultValue;
    }
    
    const keys = Array.isArray(path) ? path : path.split('.');
    let result = obj;
    
    for (let i = 0; i < keys.length; i++) {
      if (result === null || result === undefined || typeof result !== 'object') {
        return defaultValue;
      }
      result = result[keys[i]];
    }
    
    return result === undefined ? defaultValue : result;
  },

  /**
   * Check if value is null or undefined
   * Replacement for _.isNil()
   * @param {*} value - The value to check
   * @returns {boolean} True if the value is null or undefined, false otherwise
   */
  isNil: function(value) {
    return value === null || value === undefined;
  },

  /**
   * Check if two values are equal (deep comparison)
   * Replacement for _.isEqual() - basic version
   * @param {*} a - The first value to compare
   * @param {*} b - The second value to compare
   * @returns {boolean} True if the values are equal, false otherwise
   */
  isEqual: function(a, b) {
    if (a === b) return true;
    if (a === null || a === undefined || b === null || b === undefined) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!this.isEqual(a[i], b[i])) return false;
      }
      return true;
    }
    if (typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      for (let key of keysA) {
        if (!keysB.includes(key) || !this.isEqual(a[key], b[key])) return false;
      }
      return true;
    }
    return false;
  },

  /**
   * Clone object (shallow)
   * Replacement for _.clone()
   * @param {*} obj - The value to clone
   * @returns {*} A shallow clone of the value
   */
  clone: function(obj) {
    if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return [...obj];
    return { ...obj };
  },

  /**
   * Deep clone object with support for circular references and special types
   * Replacement for _.cloneDeep()
   * @param {*} obj - The value to clone
   * @param {WeakMap} [visited] - Internal parameter for circular reference detection
   * @returns {*} A deep clone of the value
   */
  cloneDeep: function(obj, visited) {
    // Initialize visited WeakMap for circular reference detection
    if (!visited) {
      visited = new WeakMap();
    }
    
    // Handle primitive values and null/undefined
    if (obj === null || obj === undefined || typeof obj !== 'object') {
      return obj;
    }
    
    // Handle circular references
    if (visited.has(obj)) {
      return visited.get(obj);
    }
    
    // Handle Date objects
    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }
    
    // Handle RegExp objects
    if (obj instanceof RegExp) {
      return new RegExp(obj.source, obj.flags);
    }
    
    // Handle Arrays
    if (Array.isArray(obj)) {
      const clonedArray = [];
      visited.set(obj, clonedArray);
      for (let i = 0; i < obj.length; i++) {
        clonedArray[i] = this.cloneDeep(obj[i], visited);
      }
      return clonedArray;
    }
    
    // Handle Functions (return reference - cannot be truly cloned)
    if (typeof obj === 'function') {
      return obj;
    }
    
    // Handle DOM elements (return reference - should not be cloned)
    if (obj.nodeType && typeof obj.cloneNode === 'function') {
      return obj;
    }
    
    // Handle plain objects
    const clonedObj = {};
    visited.set(obj, clonedObj);
    
    for (let key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = this.cloneDeep(obj[key], visited);
      }
    }
    
    return clonedObj;
  },

  /**
   * Get maximum value from array
   * Replacement for _.max()
   * @param {Array} array - The array to process
   * @returns {*} The maximum value
   */
  max: function(array) {
    if (!array || array.length === 0) return undefined;
    return Math.max(...array);
  },

  /**
   * Remove falsy values from array
   * Replacement for _.compact()
   * @param {Array} array - The array to compact
   * @returns {Array} A new array with falsy values removed
   */
  compact: function(array) {
    return array.filter(Boolean);
  },

  /**
   * Simple debounce implementation
   * Replacement for _.debounce()
   * @param {Function} func - The function to debounce
   * @param {number} wait - The number of milliseconds to delay
   * @returns {Function} The debounced function
   */
  debounce: function(func, wait) {
    let timeout;
    return function(...args) {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), wait);
    };
  },

  /**
   * Sort array by property or function
   * Replacement for _.sortBy()
   * @param {Array} array - The array to sort
   * @param {Function|string} iteratee - The iteratee function or property path
   * @returns {Array} A new sorted array
   */
  sortBy: function(array, iteratee) {
    const getKey = typeof iteratee === 'function' ? iteratee : (item) => this.get(item, iteratee);
    return [...array].sort((a, b) => {
      const valueA = getKey(a);
      const valueB = getKey(b);
      if (valueA < valueB) return -1;
      if (valueA > valueB) return 1;
      return 0;
    });
  },

  /**
   * Find first element matching predicate
   * Replacement for _.find()
   * @param {Array} array - The array to search
   * @param {Function|Object|*} predicate - The function, object, or value to test each element
   * @returns {*} The first matching element or undefined
   */
  find: function(array, predicate) {
    if (typeof predicate === 'function') {
      return array.find(predicate);
    }
    if (typeof predicate === 'object') {
      return array.find(item => {
        for (let key in predicate) {
          if (predicate.hasOwnProperty(key) && item[key] !== predicate[key]) {
            return false;
          }
        }
        return true;
      });
    }
    return array.find(item => item === predicate);
  },

  /**
   * Check if any element matches predicate
   * Replacement for _.some()
   * @param {Array} array - The array to check
   * @param {Function} predicate - The function to test each element
   * @returns {boolean} True if any element passes the test, false otherwise
   */
  some: function(array, predicate) {
    if (!array || !Array.isArray(array)) {
      return false;
    }
    return array.some(predicate);
  },

  /**
   * Iterate over collection
   * Replacement for _.forEach()
   * @param {Array|Object} collection - The collection to iterate over
   * @param {Function} iteratee - The function to call for each element
   */
  forEach: function(collection, iteratee) {
    if (!collection) {
      return; // Handle null/undefined collections gracefully
    }
    if (Array.isArray(collection)) {
      collection.forEach(iteratee);
    } else if (typeof collection === 'object') {
      Object.keys(collection).forEach(key => iteratee(collection[key], key));
    }
  },

  /**
   * Get object keys
   * Replacement for _.keys()
   * @param {Object} obj - The object to query
   * @returns {Array} An array of the object's keys
   */
  keys: function(obj) {
    return Object.keys(obj);
  },

  /**
   * Map array to new array
   * Replacement for _.map()
   * @param {Array} array - The array to map
   * @param {Function|string} iteratee - The function to call for each element or property path
   * @returns {Array} A new mapped array
   */
  map: function(array, iteratee) {
    if (!array || !Array.isArray(array)) {
      return [];
    }
    if (typeof iteratee === 'string') {
      return array.map(function(item) {
        return this.get(item, iteratee);
      }.bind(this));
    }
    if (typeof iteratee !== 'function') {
      throw new Error('FlipletDSUtils.map: iteratee must be a function or string, got ' + typeof iteratee);
    }
    return array.map(iteratee);
  },

  /**
   * Filter array by predicate
   * Replacement for _.filter()
   * @param {Array} array - The array to filter
   * @param {Function|Object|*} predicate - The function, object, or value to test each element
   * @returns {Array} A new filtered array
   */
  filter: function(array, predicate) {
    if (!array || !Array.isArray(array)) {
      return [];
    }
    if (typeof predicate === 'function') {
      return array.filter(predicate);
    }
    if (typeof predicate === 'object') {
      return array.filter(item => {
        for (let key in predicate) {
          if (predicate.hasOwnProperty(key) && item[key] !== predicate[key]) {
            return false;
          }
        }
        return true;
      });
    }
    return array.filter(item => item === predicate);
  },

  /**
   * Pick object properties
   * Replacement for _.pick()
   * @param {Object} obj - The source object
   * @param {Array|string} paths - The properties to pick
   * @returns {Object} A new object with picked properties
   */
  pick: function(obj, paths) {
    const result = {};
    if (Array.isArray(paths)) {
      paths.forEach(path => {
        if (obj.hasOwnProperty(path)) {
          result[path] = obj[path];
        }
      });
    } else {
      if (obj.hasOwnProperty(paths)) {
        result[paths] = obj[paths];
      }
    }
    return result;
  },

  /**
   * Omit object properties that match predicate
   * Replacement for _.omitBy()
   * @param {Object} obj - The source object
   * @param {Function} predicate - The function to test each property
   * @returns {Object} A new object with omitted properties
   */
  omitBy: function(obj, predicate) {
    const result = {};
    for (let key in obj) {
      if (obj.hasOwnProperty(key) && !predicate(obj[key], key)) {
        result[key] = obj[key];
      }
    }
    return result;
  },

  /**
   * Get unique values from array
   * Replacement for _.uniq()
   * @param {Array} array - The array to process
   * @returns {Array} A new array with unique values
   */
  uniq: function(array) {
    return [...new Set(array)];
  },

  /**
   * Get unique values from array by property
   * Replacement for _.uniqBy()
   * @param {Array} array - The array to process
   * @param {Function|string} iteratee - The iteratee function or property path
   * @returns {Array} A new array with unique values based on the iteratee
   */
  uniqBy: function(array, iteratee) {
    const seen = new Set();
    const getKey = typeof iteratee === 'function' ? iteratee : (item) => this.get(item, iteratee);
    
    return array.filter(item => {
      const key = getKey(item);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  },

  /**
   * Concatenate arrays
   * Replacement for _.concat()
   * @param {Array} array - The array to concatenate
   * @param {...*} values - The values to concatenate
   * @returns {Array} A new concatenated array
   */
  concat: function(array, ...values) {
    return array.concat(...values);
  },

  /**
   * Create object from arrays of keys and values
   * Replacement for _.zipObject()
   * @param {Array} keys - The property names
   * @param {Array} values - The property values
   * @returns {Object} A new object with keys mapped to values
   */
  zipObject: function(keys, values) {
    const result = {};
    for (let i = 0; i < keys.length; i++) {
      result[keys[i]] = values[i];
    }
    return result;
  },

  /**
   * Group array by property
   * Replacement for _.groupBy()
   * @param {Array} array - The array to group
   * @param {Function|string} iteratee - The iteratee function or property path
   * @returns {Object} An object with grouped arrays
   */
  groupBy: function(array, iteratee) {
    const getKey = typeof iteratee === 'function' ? iteratee : (item) => this.get(item, iteratee);
    
    return array.reduce((groups, item) => {
      const key = getKey(item);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
      return groups;
    }, {});
  },

  /**
   * Map object values
   * Replacement for _.mapValues()
   * @param {Object} obj - The object to iterate over
   * @param {Function} iteratee - The function to call for each property
   * @returns {Object} A new object with mapped values
   */
  mapValues: function(obj, iteratee) {
    const result = {};
    for (let key in obj) {
      if (obj.hasOwnProperty(key)) {
        result[key] = iteratee(obj[key], key);
      }
    }
    return result;
  },

  /**
   * Iterate over object properties
   * Replacement for _.forIn()
   * @param {Object} obj - The object to iterate over
   * @param {Function} iteratee - The function to call for each property
   */
  forIn: function(obj, iteratee) {
    for (let key in obj) {
      if (obj.hasOwnProperty(key)) {
        iteratee(obj[key], key);
      }
    }
  },

  /**
   * Get first element of array
   * Replacement for _.first()
   * @param {Array} array - The array to query
   * @returns {*} The first element of the array
   */
  first: function(array) {
    return array[0];
  },

  /**
   * Sort array by multiple criteria
   * Replacement for _.orderBy()
   * @param {Array} array - The array to sort
   * @param {Array} iteratees - The iteratees to sort by (functions or property paths)
   * @param {Array} [orders] - The sort orders ('asc' or 'desc')
   * @returns {Array} A new sorted array
   */
  orderBy: function(array, iteratees, orders) {
    // Ensure iteratees is an array
    if (!Array.isArray(iteratees)) {
      iteratees = [iteratees];
    }
    
    const getters = iteratees.map(iter => 
      typeof iter === 'function' ? iter : (item) => this.get(item, iter)
    );
    const directions = orders || iteratees.map(() => 'asc');
    
    return [...array].sort((a, b) => {
      for (let i = 0; i < getters.length; i++) {
        const valueA = getters[i](a);
        const valueB = getters[i](b);
        const direction = directions[i] === 'desc' ? -1 : 1;
        
        if (valueA < valueB) return -1 * direction;
        if (valueA > valueB) return 1 * direction;
      }
      return 0;
    });
  },

  /**
   * Assign properties from source objects to target object
   * Replacement for _.assignIn() and _.extend()
   * @param {Object} target - The target object
   * @param {...Object} sources - The source objects
   * @returns {Object} The target object
   */
  assignIn: function(target) {
    var sources = Array.prototype.slice.call(arguments, 1);
    for (var i = 0; i < sources.length; i++) {
      var source = sources[i];
      for (var key in source) {
        if (source.hasOwnProperty(key)) {
          target[key] = source[key];
        }
      }
    }
    return target;
  },

  /**
   * Alias for assignIn
   * Replacement for _.extend()
   * @param {Object} target - The target object
   * @param {...Object} sources - The source objects
   * @returns {Object} The target object
   */
  extend: function(target, ...sources) {
    return this.assignIn(target, ...sources);
  }
}; 