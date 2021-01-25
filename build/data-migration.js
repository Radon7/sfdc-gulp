const fs = require('fs')
const { exec } = require('shelljs')
const { Parser } = require('json2csv')

const SELECT = 'SELECT'
const FROM = 'FROM'
const WHERE = 'WHERE'
const ORDER_BY = 'ORDER BY'
const pullPlan = JSON.parse(fs.readFileSync('build/utils/pull-data-plan.json'))
const pushPlan = JSON.parse(fs.readFileSync('build/utils/push-data-plan.json'))

function getQueryString(objectPlan) {
  const selectStatement = [SELECT, objectPlan.fields.join(', ')].join(' ')
  const fromStatement = [FROM, objectPlan.object].join(' ')
  const whereStatement = (objectPlan.filter && [WHERE, objectPlan.filter].join(' ')) || ''
  const orderBy = (objectPlan.orderBy && [ORDER_BY, objectPlan.orderBy].join(' ')) || ''
  return [selectStatement, fromStatement, whereStatement, orderBy].join(' ')
}

function handleRes(res) {
  if (res.code) {
    throw new Error(
      `ERROR! Exited with code ${res.code}\n${res.stderr.split('\n')[0]}\nSee log above for additional info`,
    )
  }
}

function execute(command) {
  handleRes(exec(command))
}

function query(objectPlan) {
  const query = getQueryString(objectPlan)
  console.log(`Querying ${objectPlan.object}`)
  if (objectPlan.replace) {
    execute(`sfdx force:data:soql:query -q "${query}" -r json > ./build/utils/temp.json`)
    const jsonData = JSON.parse(fs.readFileSync('./build/utils/temp.json'))
    const records = jsonData.result.records.map(r => {
      const subFields = objectPlan.replace.reduce((obj, rep) => {
        obj[rep.field] = rep.currVals.includes(r[rep.field])
          && rep.newVal
          || r[rep.field]
        return obj
      }, {})
      return {...r, ...subFields}
    })
    const jsonToCsvParser = new Parser({ fields: objectPlan.fields, flatten: true })
    const csv = jsonToCsvParser.parse(records)
    fs.writeFileSync(objectPlan.storeIn, csv, 'UTF-8')
  } else {
    execute(`sfdx force:data:soql:query -r csv -q "${query}" > ${objectPlan.storeIn}`)
  }

}

function upsert(objectPlan) {
  console.log(`Upserting ${objectPlan.object}`)
  const command = `sfdx force:data:bulk:upsert -s ${objectPlan.object} -f ${objectPlan.source} -i ${objectPlan.externalId} -w 100`
  execute(command)
  console.log('--------------------------\n')
}

function pull() {
  pullPlan.forEach(objPlan => query(objPlan))
}

function push() {
  pushPlan.forEach(objPlan => upsert(objPlan))
}

exports.pull = pull
exports.push = push
