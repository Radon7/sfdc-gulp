const fs = require('fs')
const exec = require('shelljs').exec
const _ = require('lodash')
const mappings = JSON.parse(fs.readFileSync('build/utils/package-mapping.json'))
const META_EXT = '-meta.xml'

function loginJWT(username, clientId, isProduction) {
  const url = `https://${isProduction && 'login' || 'test'}.salesforce.com`
  let loginCmd = 'sfdx force:auth:jwt:grant'
  loginCmd += ` --clientid ${clientId} --username ${username} --jwtkeyfile ./build/assets/ci.key --instanceurl ${url} --loglevel debug`
  handleRes(exec(loginCmd))
}

function deploy(deploydir, username, options) {
  const user = username && `--targetusername ${username}` || '' // due to local deploy!!!!
  const checkonly = options.checkonly && ' -c' || ''
  const destructive = options.destructive && ' -g' || ''
  const testLevel = options.testLevel && ` --testlevel ${options.testLevel}` || ''
  const deployCmd = `sfdx force:mdapi:deploy ${user} --deploydir ./${deploydir} ${checkonly} ${destructive} ${testLevel} -w -1`
  handleRes(exec(deployCmd))
}

function convert(outputDir = 'build/mdapi', rootDir = 'build/temp/force-app') {
  const convertCmd = `sfdx force:source:convert -r ${rootDir} -d ${outputDir}`
  exec(convertCmd)
}

function getGlob(isDelta = false, mainSrc = getMainSrcFolder()) {
  if (isDelta) {
    const mappingFolder = _.keyBy(mappings.metadataObjects, 'directoryName')
    const files = _(fs
      .readFileSync('build/diffs.csv')
      .toString('utf-8')
      .split('\n'))
      .filter(x => x.startsWith(mainSrc))
      .flatMap(fp => {
        const mdtType = fp.replace(`${mainSrc}/main/default/`, '').split('/')[0]
        const mdtName = fp.replace(`${mainSrc}/main/default/${mdtType}`, '').split('/')[0]
        const res = [fp]
        const mdtDef = mappingFolder[mdtType]
        if (mdtDef.inFolder) res.push(`${mainSrc}/main/default/${mdtType}/${mdtName}/**`)
        if (mdtDef.metaFile) {
          if (mdtType === 'staticresources') {
            const metaString = 'resource' + META_EXT
            const glob = fp.endsWith(metaString)
              && fp.substring(0, fp.indexOf(metaString)) + '*'
              || fp.substring(0, fp.lastIndexOf('.')) + '*'
            res.push(glob)
          } else {
            res.push(fp.endsWith(META_EXT) && fp.substring(0, fp.indexOf(META_EXT)) || fp + META_EXT)
          }
        }
        res.push(fp)
        return res
      })
      .uniq()
      .value()
    return files
  } else {
    return `${mainSrc}/**`;
  }
}

function handleRes(res) {
  if (res.code) throw new Error(`Deploy error! Exited with code ${res.code}\n${res.stderr.split("\n")[0]}\nSee log above for additional info`)
  if (res.stdout.split('\n').some(line => line === 'Status:  Canceled')) {
    throw new Error('DEPLOYMENT CANCELED FROM THE ORG! The build is exiting with error status!')
  }
}

function getMainSrcFolder() {
  const projectCfg = require('../sfdx-project.json')
  return projectCfg.packageDirectories.filter(p => p.default)[0].path
}

function getEnv() {
  const env = process.env
  const target = env.TARGET
  const prefix = {
    username: 'USER_',
    clientId: 'CLIENT_',
  }
  let suffix = ''
  switch (target) {
    case 'master':
      suffix = 'PROD'
      break
    case 'release':
      suffix = 'INT'
      break
    case 'develop':
      suffix = 'FULL'
      break
    default:
      break;
  }
  return {
    username: env[prefix.username + suffix],
    clientId: env[prefix.clientId + suffix],
    isProduction: target === 'master',
    checkonly: env.CHECK_ONLY === 'true',
    destructive: env.DESTRUCTIVE === 'true',
    testLevel: env.TEST_LEVEL,
    deploydir: 'mdapi',
    delta: env.DELTA === 'true',
    environment: target
  }
}

exports.loginJWT = loginJWT
exports.deploy = deploy
exports.getGlob = getGlob
exports.convert = convert
exports.getEnv = getEnv