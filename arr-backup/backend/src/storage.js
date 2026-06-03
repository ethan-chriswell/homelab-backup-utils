import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { debug } from './debug.js'

function createLocalStorage(basePath) {
  debug('storage', `local storage init at ${basePath}`)
  mkdirSync(basePath, { recursive: true })

  return {
    type: 'local',

    async save(name, buffer) {
      const dest = join(basePath, name)
      debug('storage', `local save: ${dest} (${buffer.length} bytes)`)
      await pipeline(Readable.from(buffer), createWriteStream(dest))
      debug('storage', `local save complete: ${dest}`)
    },

    list() {
      debug('storage', `local list: ${basePath}`)
      if (!existsSync(basePath)) {
        debug('storage', `local list: path does not exist`)
        return []
      }
      const files = readdirSync(basePath)
        .filter(f => f.endsWith('.zip'))
        .map(f => {
          const stat = statSync(join(basePath, f))
          return { name: f, date: stat.mtime.toISOString(), size: stat.size, source: 'local' }
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date))
      debug('storage', `local list: found ${files.length} backup(s)`, files.map(f => f.name))
      return files
    },

    getStream(name) {
      const p = join(basePath, name)
      debug('storage', `local getStream: ${p}`)
      if (!existsSync(p)) throw Object.assign(new Error('Not found'), { status: 404 })
      return createReadStream(p)
    },

    delete(name) {
      const p = join(basePath, name)
      debug('storage', `local delete: ${p}`)
      if (existsSync(p)) {
        unlinkSync(p)
        debug('storage', `local delete: removed ${p}`)
      } else {
        debug('storage', `local delete: file not found, skipping`)
      }
    },
  }
}

function createS3Storage(s3Config) {
  debug('storage', 's3 storage init', {
    endpoint: s3Config.endpoint || '(aws default)',
    bucket: s3Config.bucket,
    region: s3Config.region,
    prefix: s3Config.prefix,
    forcePathStyle: s3Config.forcePathStyle,
    accessKeyIdSet: Boolean(s3Config.accessKeyId),
    secretAccessKeySet: Boolean(s3Config.secretAccessKey),
  })

  let client, S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command

  async function init() {
    if (client) return
    debug('storage', 's3 initialising SDK client')
    const mod = await import('@aws-sdk/client-s3')
    S3Client = mod.S3Client
    PutObjectCommand = mod.PutObjectCommand
    GetObjectCommand = mod.GetObjectCommand
    DeleteObjectCommand = mod.DeleteObjectCommand
    ListObjectsV2Command = mod.ListObjectsV2Command

    const clientOpts = {
      region: s3Config.region,
      credentials: { accessKeyId: s3Config.accessKeyId, secretAccessKey: s3Config.secretAccessKey },
    }
    if (s3Config.endpoint) {
      clientOpts.endpoint = s3Config.endpoint
      clientOpts.forcePathStyle = s3Config.forcePathStyle
    }
    client = new S3Client(clientOpts)
    debug('storage', 's3 SDK client ready')
  }

  function key(name) {
    return `${s3Config.prefix}${name}`
  }

  return {
    type: 's3',

    async save(name, buffer) {
      await init()
      const k = key(name)
      debug('storage', `s3 upload: s3://${s3Config.bucket}/${k} (${buffer.length} bytes)`)
      const mod = await import('@aws-sdk/lib-storage')
      const upload = new mod.Upload({
        client,
        params: { Bucket: s3Config.bucket, Key: k, Body: Buffer.from(buffer) },
      })
      await upload.done()
      debug('storage', `s3 upload complete: ${k}`)
    },

    async list() {
      await init()
      debug('storage', `s3 list: s3://${s3Config.bucket}/${s3Config.prefix}`)
      const res = await client.send(new ListObjectsV2Command({
        Bucket: s3Config.bucket,
        Prefix: s3Config.prefix,
      }))
      const files = (res.Contents || [])
        .filter(obj => obj.Key.endsWith('.zip'))
        .map(obj => ({
          name: obj.Key.replace(s3Config.prefix, ''),
          date: obj.LastModified?.toISOString() || '',
          size: obj.Size || 0,
          source: 's3',
        }))
        .sort((a, b) => new Date(b.date) - new Date(a.date))
      debug('storage', `s3 list: found ${files.length} backup(s)`, files.map(f => f.name))
      return files
    },

    async getStream(name) {
      await init()
      const k = key(name)
      debug('storage', `s3 getStream: s3://${s3Config.bucket}/${k}`)
      const res = await client.send(new GetObjectCommand({ Bucket: s3Config.bucket, Key: k }))
      return res.Body
    },

    async delete(name) {
      await init()
      const k = key(name)
      debug('storage', `s3 delete: s3://${s3Config.bucket}/${k}`)
      await client.send(new DeleteObjectCommand({ Bucket: s3Config.bucket, Key: k }))
      debug('storage', `s3 delete complete: ${k}`)
    },
  }
}

function createNullStorage() {
  debug('storage', 'null storage (no secondary storage configured)')
  return {
    type: 'none',
    async save() { debug('storage', 'null save: no-op') },
    list() { debug('storage', 'null list: []'); return [] },
    getStream() { throw Object.assign(new Error('No storage configured'), { status: 404 }) },
    delete() { debug('storage', 'null delete: no-op') },
  }
}

export function createStorage(config) {
  debug('storage', `createStorage: type=${config.storageType}`)
  if (config.storageType === 'local') return createLocalStorage(config.localPath)
  if (config.storageType === 's3') return createS3Storage(config.s3)
  return createNullStorage()
}
