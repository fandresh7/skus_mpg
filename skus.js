
/*
  @ ARCHIVOS NECESARIOS

  + EXCEL del catálogo de skus enviado de MPG
    * Las columnas deben ser: sku, marca, cupo, material, clasificacion, drv, sector
  + EXCEL del catálogo de "el dorado" enviado de MPG
    * Las columas deben ser: sku, marca, cupo, material, clasificacion, drv, sector

  ! Si alguno de las columnas del EXCEL no se encuentra, dejar el título igual
  ! La clasificacion debe ser igual a los que están en CATEGORIES

  + JSON de los externals configurados
    * Extraidos del network al consultar los skus del dashboard

  @ ARCHIVOS CREADOS
  
  + EXCEL con los externals que deben cambiar su categoria
  + JSON con el listado de SKUS y su respectiva clasificación (categoria) de acuerdo al KPI - subir a s3
  + JSON con las categorias que se deben ingresar en las métricas
*/

const fs = require('fs')
const xlsx = require('node-xlsx')
const json2xls = require('json2xls')

const CATEGORIES = [
  'tradicionales', //
  'innovaciones', //
  'premium', //
  'beyond_beer',
  'marketplace',
  'above_core',
  'retornable', //
  'portafolio_foco',
  'volumen_el_dorado',
  'premium_el_dorado',
  'retornable_el_dorado',
  'volumen_sellin', //
  'volumen_sellout', //
  'retornable_sellin', //
]

const KPIS = {
  volumen: ['beyond_beer', 'innovaciones', 'tradicionales', 'premium'],
  volumen_retornable: ['retornable'],
  volumen_retornable_el_dorado: ['retornable_el_dorado'],
  innovaciones: ['innovaciones'],
  premium: ['premium'],
  beyond_beer: ['beyond_beer'],
  volumen_el_dorado: ['volumen_el_dorado'],
  premium_el_dorado: ['premium_el_dorado'],
  above_core: ['above_core'],
  portafolio_focus: ['portafolio_foco'],
  marketplace: ['agua', 'cigarros', 'energizantes', 'hidratante', 'hard_liquor', 'rtd', 'refrescos', 'vendo'],
  volumen_sellin: ['volumen_sellin'],
  volumen_sellout: ['volumen_sellout'],
  volumen_retornable_sellin: ['retornable_sellin']
}

/* 
  * Leer el catálogo
*/
const getCatalogue = (fileName) => {
  const workSheetsFromFile = xlsx.parse(`./input/${ fileName }.xlsx`)
  let data = workSheetsFromFile[0].data
  let [ _, ...rows ] = data

  let ordenedSkus = {}
  rows.forEach( row => {
    let [ sku, marca, cupo, material, clasificacion, drv, sector ] = row
    
    if(!ordenedSkus.hasOwnProperty(sku)) {
      let skuData = { drv: [], sku, marca, cupo, material, clasificacion: [], sector }
      ordenedSkus[sku] = skuData
    }

    if(drv && !ordenedSkus[sku].drv.includes(drv)) ordenedSkus[sku].drv.push(drv)
    if(!ordenedSkus[sku].clasificacion.includes(clasificacion)) ordenedSkus[sku].clasificacion.push(clasificacion)
  })
  
  return Object.values(ordenedSkus)
}

/*
  * Algunos SKUS de "eldorado" pueden estar en el católogo, 
  * por lo tanto hay que hacer una validación y unir las clasificaciones si es necesario
*/
const getSkus = () => {
  let catalogue = getCatalogue('catalogue')
  // let catalogueElDorado = getCatalogue('eldorado')

  // let completeCatalogue = [...catalogue, ...catalogueElDorado]
  let completeCatalogue = [...catalogue]

  let skus = {}
  completeCatalogue.forEach( item => {
    let { drv, sku, clasificacion, material, cupo, marca, sector } = item

    if(!skus.hasOwnProperty(sku)) {
      skus[sku] = {}
      skus[sku].clasificacion = []
      skus[sku].drv = []
    }

    skus[sku]['sku'] = sku
    skus[sku]['material'] = material
    skus[sku]['cupo'] = cupo
    skus[sku]['marca'] = marca
    skus[sku]['sector'] = sector
    skus[sku]['clasificacion'].push(...clasificacion)
    if(drv) skus[sku]['drv'].push(...drv)
  })

  // ordenar las clasificaciones en orden alfabético
  Object.values(skus).forEach( sku => {
    sku.clasificacion = sku.clasificacion.sort( (a, b) => a < b ? -1 : 1)
  })
  
  return Object.values(skus)
}

const getExternals = () => {
  let rawdata = fs.readFileSync('./input/externals.json')
  let externalsArray = JSON.parse(rawdata)
  let externals = externalsArray.flat()

  return externals
}

const categoriesForMetrics = (skus) => {
  let result = {}
  Object.entries(KPIS).forEach( entry => {
    let [ kpi, categories ] = entry

    if(!result.hasOwnProperty(kpi)) result[kpi] = []

    skus.forEach( sku => {
      let clasification = sku.clasificacion
      categories.forEach( category => {
        if(clasification.includes(category)) {
          let clasificacionString = clasification.join('-')
          if(!result[kpi].includes(clasificacionString)) {
            result[kpi].push(clasificacionString)
          }
        }
      })
    })
  })

  return result
}

const getChangesToExternals = (externals, skus) => {
  let result = []

  skus.forEach( skuData => {
    let { clasificacion, sku } = skuData
    let skuSlug = `sku_${ sku }`
    let skuExternal = externals.find( external => skuSlug == external.slug)

    let actualCategory = skuExternal?.category
    let newCategory = clasificacion.join('-')

    result.push({
      name: `sku_${ sku }`,
      actualCategory,
      newCategory,
      change: actualCategory !== newCategory
    })
  })

  return result
}

const init = () => {
  let skus = getSkus()
  let externals = getExternals()
  let metrics = categoriesForMetrics(skus)
  let changesToExternals = getChangesToExternals(externals, skus)
  
  let skusJson = JSON.stringify(skus)
  fs.writeFileSync('output/skus_agosto_2023.json', skusJson)

  let metricsJson = JSON.stringify(metrics)
  fs.writeFileSync('output/metrics.json', metricsJson)

  let externalsFile = json2xls(changesToExternals)
  fs.writeFileSync(`output/externals.xlsx`, externalsFile, 'binary')
}

init()
