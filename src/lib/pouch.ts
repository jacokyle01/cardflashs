// Centralized PouchDB construction. We assemble PouchDB from its modular
// pieces rather than importing `pouchdb-browser`, because the umbrella
// package's prebundled CJS shim trips Vite/Rolldown's ESM interop with the
// "Class extends value [object Object] is not a constructor" runtime error.
//
// This module is the single place plugins are registered. Importing this
// file anywhere in the app guarantees the plugins are installed before any
// PouchDB instance is built.

import PouchDB from 'pouchdb-core'
import IDBAdapter from 'pouchdb-adapter-idb'
import HttpAdapter from 'pouchdb-adapter-http'
import mapreduce from 'pouchdb-mapreduce'
import replication from 'pouchdb-replication'
import find from 'pouchdb-find'

PouchDB
  .plugin(IDBAdapter)
  .plugin(HttpAdapter)
  .plugin(mapreduce)
  .plugin(replication)
  .plugin(find)

export default PouchDB
