import React from 'react'

import { aggregators, round } from './aggregators'

// Convert column-based data to rows
// e.g. { a: [1, 2], b: ['x', 'y'] } to [{ a: 1, b: 'x' }, { a: 2, b: 'y' }]
export function columnsToRows(columns) {
  const names = Object.keys(columns)
  const rows = new Array(columns[names[0]].length)
  for (let i = 0; i < rows.length; i++) {
    rows[i] = {}
    for (let name of names) {
      rows[i][name] = columns[name][i]
    }
  }
  return rows
}

export function buildColumnDefs(columns, groups) {
  columns = columns.map(col => {
    col.id = col.accessor
    if (col.accessor.includes('.')) {
      // Interpret column names with dots as IDs, not paths
      col.accessor = data => data[col.id]
    }

    if (typeof col.aggregate === 'string' && aggregators[col.aggregate]) {
      const type = col.aggregate
      col.aggregate = aggregators[type]
    }

    // Column formatters
    if (col.format && col.format.cell) {
      col.Cell = cell => formatValue(cell.value, col.format.cell)
    }
    if (col.format && col.format.aggregated) {
      col.Aggregated = cell => formatValue(cell.value, col.format.aggregated)
    }

    // Column renderers
    if (col.render && col.render.cell) {
      const renderCell = col.render.cell
      const prevCell = col.Cell
      col.Cell = function renderedCell(cell) {
        if (prevCell) {
          cell.value = prevCell(cell)
        }
        return <div dangerouslySetInnerHTML={{ __html: renderCell(cell) }} />
      }
    }
    if (col.render && col.render.aggregated) {
      const renderAggregated = col.render.aggregated
      const prevAggregated = col.Aggregated
      col.Aggregated = function renderedCell(cell) {
        if (prevAggregated) {
          cell.value = prevAggregated(cell)
        }
        return <div dangerouslySetInnerHTML={{ __html: renderAggregated(cell) }} />
      }
    } else if (!col.Aggregated) {
      // Set a default renderer to prevent the cell renderer from applying
      // to aggregated cells (without having to check cell.aggregated).
      col.Aggregated = cell => cell.value
    }

    if (col.type === 'numeric') {
      col.sortMethod = compareNumbers
      // Right-align numbers by default
      col.style = { textAlign: 'right', ...col.style }
    }

    return col
  })

  if (groups) {
    columns = addColumnGroups(columns, groups)
  }

  return columns
}

// Add groups to an array of column definitions
export function addColumnGroups(columns, groups) {
  groups.forEach(group => {
    const groupIds = group.columns
    group.columns = []
    columns = columns.reduce((newCols, col) => {
      if (col.id === groupIds[0]) {
        newCols.push(group)
        group.columns.push(col)
      } else if (groupIds.includes(col.id)) {
        group.columns.push(col)
      } else {
        newCols.push(col)
      }
      return newCols
    }, [])
  })

  // Workaround for bug in react-table >= 6.5.2 where ungrouped pivot columns
  // are incompatible with grouped aggregate columns. Add all ungrouped
  // columns to their own header group (combining adjacent columns).
  // https://github.com/tannerlinsley/react-table/issues/472
  const newCols = []
  let lastGroup
  columns.forEach(col => {
    if (col.columns) {
      // Already a header group
      newCols.push(col)
      lastGroup = null
    } else {
      // Individual column
      if (!lastGroup) {
        lastGroup = { columns: [] }
        newCols.push(lastGroup)
      }
      lastGroup.columns.push(col)
    }
  })
  columns = newCols

  return columns
}

// Compare function that handles handles NAs and Inf/-Inf
export function compareNumbers(a, b) {
  a = normalizeNumber(a)
  b = normalizeNumber(b)
  a = typeof a === 'string' ? a.toLowerCase() : a
  b = typeof b === 'string' ? b.toLowerCase() : b
  if (a === b) {
    return 0
  }
  if (a == null) {
    return -1
  }
  if (b == null) {
    return 1
  }
  if (a > b) {
    return 1
  }
  if (a < b) {
    return -1
  }
  return 0
}

function normalizeNumber(n) {
  if (n === null || n === undefined || n === 'NA') {
    n = null
  }
  if (n === 'Inf') {
    n = Infinity
  }
  if (n === '-Inf') {
    n = -Infinity
  }
  return n
}

export function formatValue(value, { prefix, suffix, digits, separators, currency, locales }) {
  if (typeof value === 'number') {
    if (digits != null) {
      value = round(value, digits)
    }
    if (separators || currency) {
      const options = { useGrouping: separators ? true : false }
      if (currency) {
        options.style = 'currency'
        options.currency = currency
      } else {
        options.maximumFractionDigits = 20
      }
      value = value.toLocaleString(locales || undefined, options)
    }
  }
  if (prefix != null) {
    value = String(prefix) + value
  }
  if (suffix != null) {
    value = value + String(suffix)
  }
  return value
}