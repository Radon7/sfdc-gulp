const fs = require('fs')
const { series, src, dest } = require('gulp')
const { convert, getGlob, loginJWT, deploy, getEnv } = require('./build/gulp-utils')
const { pull, push } = require('./build/data-migration')
const { editXml, processConfig } = require('./build/pre-deploy-fix')
const merge = require('merge-stream')
const _ = require('lodash')
const del = require('del')
const env = getEnv()

const MDAPI_PATH = 'build/mdapi'
let glob


function copy(cb) {
  const opts = { base: '.', allowEmpty: true }
  glob = getGlob(env.delta)
  if (isEmptyGlob(glob)) return cb()
  return src(glob, { base: '.', allowEmpty: true })
    .pipe(dest('build/temp'))
}

function mdapiConvert(cb) {
  if (!isEmptyGlob(glob)) {
    convert()
  } else {
    console.warn('Skipping Convert since nothing to deploy')
  }
  cb()
}

function cleanTemp() {
  return del(['build/temp/force-app/**', 'build/mdapi', '!build/temp/force-app/.gitkeep'])
}

function ciDeploy(cb) {
  if (!isEmptyGlob(glob)) {
    const opts = {
      checkonly: env.checkonly,
      testLevel: env.testLevel,
    }
    loginJWT(env.username, env.clientId, env.isProduction)
    deploy('build/mdapi', env.username, opts)
  } else {
    console.warn('Skipping Deploy because there is nothing to deploy')
  }
  cb()
}

function ciDestructive(cb) {
  loginJWT(env.username, env.clientId, env.isProduction)
  deploy('build/destructive', env.username, { destructive: true })
  cb()
}

function localDeploy(cb) {
  const opts = {
    checkonly: env.checkonly,
    testLevel: env.testLevel,
  }
  deploy('build/mdapi', undefined, opts)
  cb()
}

function predeploy(cb) {
  var confs
  try {
    confs = JSON.parse(fs.readFileSync('./build/utils/pre-deploy-fixes.json'), 'utf8')
  } catch (e) {
    console.log(e)
    console.warn('WARNING: missing pre-deploy-fixes.json')
    cb()
    return
  }

  const envName = env.environment || process.env.environment
  console.log('envName', envName)
  var actualConf = Object.assign({}, confs['default'] || {}, confs[envName] || {})
  if (!_.keys(actualConf).length) return
  var streams = merge()
  _.each(_.keys(actualConf), function (path) {
    streams.add(
      src(`${MDAPI_PATH}/${path}`, {allowEmpty: true})
      .pipe(editXml(function (xml) {
        var confs = actualConf[path]
        if (!_.isArray(confs)) confs = [confs]
        _.each(confs, function (conf) {
          processConfig(xml, conf)
        })
        return xml || {}
      }))
      .pipe(dest(`${MDAPI_PATH}/${path.substring(0, path.lastIndexOf('/'))}`))
    )
  })

  if (streams.isEmpty()) cb()
  return streams
}

function localDestroy(cb) {
  deploy('build/destructive', undefined, { destructive: true })
  cb()
}

function pullCpqData(cb) {
  pull()
  del(['build/utils/temp.json'])
  cb()
}

function pushCpqData(cb) {
  push()
  cb()
}

function isEmptyGlob (glob) {
  return Array.isArray(glob) && glob.length === 0
}

exports.predeploy = series(copy, mdapiConvert, predeploy)
exports.clean = cleanTemp
exports.default = series(cleanTemp, copy, mdapiConvert, predeploy, ciDeploy)

exports['local:deploy'] = series(cleanTemp, copy, mdapiConvert, predeploy, localDeploy, cleanTemp)
exports['local:destroy'] = localDestroy

exports['ci:deploy'] = exports.default
exports['ci:destroy'] = ciDestructive

exports['local:pullCpq'] = pullCpqData
exports['local:pushCpq'] = pushCpqData