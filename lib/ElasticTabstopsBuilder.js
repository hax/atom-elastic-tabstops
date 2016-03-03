'use babel'

class ElasticTabstops {
	constructor() {
		this._blocks	= []
		this._index	= {}
	}
	getColumnBlock(line, column) {
		const l = this._index[line]
		if (!l) return null
		const i = l[column]
		if (!i) return null
		return this._blocks[i]
	}
	getColumnBlocksOfLine(line) {
		const l = this._index[line]
		if (!l) return null
		return l.map(i => this._blocks[i])
	}
	get columnBlocks() {
		return this._blocks.slice()
	}
}

export default class ElasticTabstopsBuilder {
	constructor() {
		this._tabstops	= new ElasticTabstops()
		this._line	= -1
		this._column	= -1
	}
	get elasticTabstops() {
		return this._tabstops
	}
	line(i = this._line + 1) {
		if (i < this._tabstops._index.length) throw `rebuild line ${i}`
		this._tabstops._index[i]	= []
		this._line	= i
		this._column	= 0
		return this
	}
	cell(cell) {
		const index	= this._tabstops._index
		const blocks	= this._tabstops._blocks
		let i
		const l = index[this._line - 1]
		if (l) i = l[this._column]
		if (i !== undefined) {
			blocks[i].cells.push(cell)
		} else {
			i = blocks.length
			blocks[i] = {
				 line:	this._line,
				 column:	this._column,
				 cells:	[cell],
			}
		}
		index[this._line][this._column] = i
		++this._column
		return this
	}
}
