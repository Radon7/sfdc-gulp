
const xmlEdit = require('gulp-edit-xml')
const _ = require('lodash')
const jsonQuery = require('json-query')

function editXml (callback) {
  return xmlEdit(callback, {
    builderOptions: {
      renderOpts: {
        'pretty': true,
        'indent': '    ',
        'newline': '\n'
      },
      xmldec: {
        encoding: 'UTF-8'
      }
    },
    parserOptions: {
      explicitArray: true
    }
  })
}

function processConf (xml, conf) {
  var token = xml
  if (conf.where) token = jsonQuery(conf.where, { data: xml })

  if (!token.value) return xml
  token = token.value
  if (!_.isArray(token)) token = [token]
  // replace in xml
  if (conf.replace) {
    _.each(_.keys(conf.replace), function (t) {
      _.each(token, function (tk) {
        tk[t] = conf.replace[t]
      })
    })
  }
  // add to xml
  if (conf.add) {
    _.each(_.keys(conf.add), function (t) {
      _.each(token, function (tk) {
        tk[t] = conf.add[t]
      })
    })
  }
  // filter objects config
  if (conf.filter) {
    _.each(conf.filter, function (valueToFilter) {
      if (_.isObject(valueToFilter)) {
        if (valueToFilter.jsonQuery) token[0][valueToFilter.value] = jsonQuery(valueToFilter.expression, { data: token[0] }).value
        else delete token[0][valueToFilter.value]
      } else {
        delete token[0][valueToFilter]
      }
    })
  }
  // Remove TABS from Flexy pages
  if (conf.removeFlexiPageTabs) {
    _.each(conf.removeFlexiPageTabs, function (tabToRemove) {
      let innerRegIdx = -1
      const regionIdx = _.findIndex(token[0].flexiPageRegions, reg => {
        if (reg.componentInstances) {
          const flexipagetabIx = _.findIndex(reg.componentInstances, inst => inst.componentName && inst.componentName[0] === 'flexipage:tab')
          innerRegIdx = _.findIndex(reg.componentInstances, inst => {
            return _.some(inst.componentInstanceProperties, cip => cip.value && cip.value[0] === tabToRemove)
          })
          return flexipagetabIx !== -1 && innerRegIdx !== -1
        } else {
          return false
        }
      })
      if (regionIdx !== -1 && innerRegIdx !== -1) {
        const cmpProps = token[0].flexiPageRegions[regionIdx].componentInstances[innerRegIdx].componentInstanceProperties
        const facetName = _.find(cmpProps, prop => prop.name[0] === 'body').value[0]
        if (_.findIndex(token[0].flexiPageRegions, reg => reg.name[0] === facetName) !== -1) {
          delete token[0].flexiPageRegions[regionIdx].componentInstances[innerRegIdx]
          _.remove(token[0].flexiPageRegions, reg => reg.name[0] === facetName)
        }
      }
    })
  }
  // delete permissions block from profile
  if (conf.deletePermissionBlocks) {
    _.each(conf.deletePermissionBlocks, function (perm) {
      if (_.findIndex(token[0].userPermissions, p => p.name[0] === perm) !== -1) {
        _.remove(token[0].userPermissions, p => {
          return p.name[0] === perm
        })
      }
    })
  }
  // delete ipranges from profile
  if (conf.deleteIpRanges) {
    if (_.findIndex(token[0].loginIpRanges) !== -1) {
      _.remove(token[0].loginIpRanges)
    }
  }

  // delete field permissions from profiles
  if (conf.deleteFieldPermissions) {
    _.each(conf.deleteFieldPermissions, function (perm) {
      if (_.findIndex(token[0].fieldPermissions, p => p.field[0] === perm) !== -1) {
        _.remove(token[0].fieldPermissions, p => {
          return p.field[0] === perm
        })
      }
    })
  }

  if (conf.concat) {
    _.each(conf.concat, function (tk) {
      token.push(tk)
    })
  }

  if (conf.disablePermissions) {
    // SE E' GIA PRESENTE UN BLOCCO DI CONFIG PER QUELL'OGGETTO, USO QUELLO. ALTRIMENTI DISABILITO TUTTO
    _.each(conf.disablePermissions, function (perm) {
      if (_.findIndex(token[0].userPermissions, p => p.name[0] === perm) === -1) {
        token[0].userPermissions.push({
          enabled: false,
          name: perm
        })
      }
    })
  }

  if (conf.disableTabs) {
    // SE E' GIA PRESENTE UN BLOCCO DI CONFIG PER QUELL'OGGETTO, USO QUELLO. ALTRIMENTI DISABILITO TUTTO
    _.each(conf.disableTabs, function (perm) {
      if (_.findIndex(token[0].tabVisibilities, t => t.tab[0] === perm) === -1) {
        token[0].tabVisibilities.push({
          tab: perm,
          visibility: 'Hidden'
        })
      }
    })
  }
  // Disable permissions block from profiles
  if (conf.enableTabs) {
    // SE E' GIA PRESENTE UN BLOCCO DI CONFIG PER QUELL'OGGETTO, USO QUELLO. ALTRIMENTI DISABILITO TUTTO
    _.each(conf.enableTabs, function (perm) {
      if (_.findIndex(token[0].tabVisibilities, t => t.tab[0] === perm) === -1) {
        token[0].tabVisibilities.push({
          tab: perm,
          visibility: 'DefaultOn'
        })
      }
    })
  }

  // disable Apps
  if (conf.disableApps) {
    // SE E' GIA PRESENTE UN BLOCCO DI CONFIG PER QUELL'OGGETTO, USO QUELLO. ALTRIMENTI DISABILITO TUTTO
    _.each(conf.disableApps, function (perm) {
      if (_.findIndex(token[0].applicationVisibilities, t => t.application[0] === perm) === -1) {
        token[0].applicationVisibilities.push({
          application: perm,
          default: false,
          visible: false
        })
      }
    })
  }
  // disable object from profiles
  if (conf.disableObjects) {
    // SE E' GIA PRESENTE UN BLOCCO DI CONFIG PER QUELL'OGGETTO, USO QUELLO. ALTRIMENTI DISABILITO TUTTO
    _.each(conf.disableObjects, function (obj) {
      if (_.findIndex(token[0].objectPermissions, o => o.object[0] === obj) === -1) {
        token[0].objectPermissions.push({
          'allowCreate': false,
          'allowDelete': false,
          'allowEdit': false,
          'allowRead': false,
          'modifyAllRecords': false,
          'object': obj,
          'viewAllRecords': false
        })
      }
    })
  }

  // remove validation rules from objects
  if (conf.deleteValidations) {
    _.each(conf.deleteValidations, function (perm) {
      if (_.findIndex(token[0].validationRules, p => p.fullName[0] === perm) !== -1) {
        _.remove(token[0].validationRules, p => {
          return p.fullName[0] === perm
        })
      }
    })
  }

  // remove fields from object
  if (conf.deleteFields) {
    _.each(conf.deleteFields, function (perm) {
      if (_.findIndex(token[0].fields, p => p.fullName[0] === perm) !== -1) {
        _.remove(token[0].fields, p => {
          return p.fullName[0] === perm
        })
      }
    })
  }

  // remove picklists from record type
  if (conf.removePicklistFromRt) {
    _.each(conf.removePicklistFromRt, function (field) {
      _.each(token[0].recordTypes, (rt) => {
        if (_.findIndex(rt.picklistValues, p => p.picklist[0] === field) !== -1) {
          _.remove(rt.picklistValues, p => {
            return p.picklist[0] === field
          })
        }
      })
    })
  }
}

exports.editXml = editXml
exports.processConfig = processConf
