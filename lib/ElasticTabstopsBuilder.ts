export class ElasticTabstops<Cell> {
	constructor(
		private readonly blocks: Block<Cell>[],
		private readonly index: Index2D,
	) {}
	getColumnBlock(line: number, column: number) {
		const l = this.index[line]
		if (!l) return null
		const i = l[column]
		if (!i) return null
		return this.blocks[i]
	}
	getColumnBlocksOfLine(line: number) {
		const l = this.index[line]
		if (!l) return null
		return l.map(i => this.blocks[i])
	}
	get columnBlocks() {
		return this.blocks.slice()
	}
}

export default class ElasticTabstopsBuilder<Cell> {
	private readonly blocks: Block<Cell>[]
	private readonly index: Index2D
	private readonly tabstops = new ElasticTabstops(this.blocks, this.index)
	private _line = -1
	private _column = -1
	get elasticTabstops() {
		return this.tabstops
	}
	line(i = this._line + 1) {
		if (i < this.index.length) throw new Error(`rebuild line ${i}`)
		this.index[i]	= []
		this._line	= i
		this._column	= 0
		return this
	}
	cell(cell: Cell) {
		let i
		const l = this.index[this._line - 1]
		if (l) i = l[this._column]
		if (i !== undefined) {
			this.blocks[i].cells.push(cell)
		} else {
			i = this.blocks.length
			this.blocks[i] = {
				 line:	this._line,
				 column:	this._column,
				 cells:	[cell],
			}
		}
		this.index[this._line][this._column] = i
		++this._column
		return this
	}
}

export interface Block<Cell> {
	line: number
	column: number
	cells: Cell[]
}

export interface Index2D extends Array<Array<number>> {}
