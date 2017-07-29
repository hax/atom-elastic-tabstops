'use babel'

import {CompositeDisposable}	from 'atom'
import ElasticTabstopsBuilder	from './ElasticTabstopsBuilder'
import {queryAll, prepend, after, replaceWith}	from './dom'

const LINE	= 'div.line'
const TAB	= 'span.hard-tab:not(.trailing-whitespace)'
const FILL	= 'span.fill'

const LEADING	= 'leading-whitespace'
const INVISIBLE	= 'invisible-character'


export const config = {
	overrideMoveUpDownBehavior: {
		type: 'boolean',
		default: true,
	}
}

function useAlt() {
	return atom.config.get('elastic-tabstops.overrideMoveUpDownBehavior')
}

const subscriptions = new CompositeDisposable()
export function activate(state) {
	// console.log('activate', state)
	subscriptions.add(
		atom.workspace.observeTextEditors(enable),
		atom.commands.add('atom-text-editor', 'elastic-tabstops:toggle', e => {
			const editor = e.target.getModel()
			if (atom.views.getView(editor).classList.contains('elastic-tabstops')) {
				disable(editor)
			} else {
				enable(editor)
			}
		}),
		atom.commands.add('atom-text-editor:not([mini])', {
			'elastic-tabstops:move-up': e => {
				const editor = e.target.getModel()
				editor.altMoveUp()
			},
			'elastic-tabstops:move-down': e => {
				const editor = e.target.getModel()
				editor.altMoveDown()
			},
		}),
	)
}
export function deactivate() {
	// console.log('deactivate')
	for (const editor of atom.workspace.getTextEditors()) {
		disable(editor)
	}
	subscriptions.dispose()
}

function moveCursorRows(editorComponent, cursor, rows) {
	const {row, column} = cursor.getScreenPosition()
	const left = do {
		if (cursor.goalLeft != null) cursor.goalLeft
		else editorComponent.pixelPositionForScreenPosition({row, column}).left
	}
	const {top} = editorComponent.pixelPositionForScreenPosition({row: row + rows, column})
	const pos = editorComponent.screenPositionForPixelPosition({top, left})
	cursor.setScreenPosition(pos)
	cursor.goalLeft = left
}

function disable(editor) {
	const editorElement = atom.views.getView(editor)
	editorElement.classList.remove('elastic-tabstops')

	if (editor._moveUp) {
		editor.moveUp = editor._moveUp
		delete editor._moveUp
	}
	if (editor._moveDown) {
		editor.moveDown = editor._moveDown
		delete editor._moveDown
	}
	delete editor._altMoveup
	delete editor._altMoveDown
	delete editor.altMoveup
	delete editor.altMoveDown

	if (editor._cursorChanged) editor._cursorChanged.dispose()

	const c = editorElement.component.linesComponent
	if (c._updateTileNodes) {
		c.updateTileNodes = c._updateTileNodes
		delete c._updateTileNodes
	}

	// clear tab styles and remove fills
	for (const {style} of c.getDomNode().querySelectorAll(TAB)) {
		style.width = style.paddingLeft = style.paddingRight = null
	}
	for (const fill of c.getDomNode().querySelectorAll(FILL)) {
		fill::replaceWith(fill.textContent)
	}
}

function enable(editor) {
	const editorElement = atom.views.getView(editor)
	editorElement.classList.add('elastic-tabstops')

	editor._moveUp = editor.moveUp
	editor._moveDown = editor.moveDown
	editor._altMoveUp = function (lineCount = 1) {
		const {component} = atom.views.getView(this)
		this.moveCursors(cursor => moveCursorRows(component, cursor, -lineCount))
	}
	editor._altMoveDown = function (lineCount = 1) {
		const {component} = atom.views.getView(this)
		this.moveCursors(cursor => moveCursorRows(component, cursor, lineCount))
	}
	editor.moveUp = function (lineCount) {
		if (useAlt()) this._altMoveUp(lineCount)
		else this._moveUp(lineCount)
	}
	editor.moveDown = function (lineCount) {
		if (useAlt()) this._altMoveDown(lineCount)
		else this._moveDown(lineCount)
	}
	editor.altMoveUp = function (lineCount) {
		if (useAlt()) this._moveUp(lineCount)
		else this._altMoveUp(lineCount)
	}
	editor.altMoveDown = function (lineCount) {
		if (useAlt()) this._moveDown(lineCount)
		else this._altMoveDown(lineCount)
	}
	editor._cursorChanged = editor.onDidChangeCursorPosition(e => {
		e.cursor.goalLeft = null
	})

	// monkey patch lines component
	const c = editorElement.component.linesComponent
	c._updateTileNodes = c.updateTileNodes
	c.updateTileNodes =	function () {
			this._updateTileNodes()
			if (editor.getSoftTabs()) return
			update(this.getDomNode())
		}

	// function clearCache(lines) {
	// 	const presenter = editorElement.component.presenter
	// 	const y = presenter.getLinesYardstick()
	// 	if (lines) for (const line of lines) {
	// 		const cache = y.leftPixelPositionCache
	// 			|| y.pixelPositionsByLineIdAndColumn // Atom < 1.9
	// 		const id = presenter.lineIdForScreenRow(line)
	// 		delete cache[id]
	// 	} else {
	// 		y.leftPixelPositionCache = {}
	// 	}
	// }

	// clearCache()

	const handles = new Set
	function update(containerElement) {
		if (handles.size > 0) {
			// console.log('cancle old alignments', handles.size)
			for (const handle of handles) cancelAnimationFrame(handle)
			handles.clear()
		}

		// console.time('create column blocks')
		const tabstops = createTabstops(containerElement)
		// console.timeEnd('create column blocks')

		const cursorBlocks = new Set
		for (const position of editor.getCursorScreenPositions()) {
			const blocks = tabstops.getColumnBlocksOfLine(position.row)
			if (blocks) for (const block of blocks) cursorBlocks.add(block)
		}
		const lines = new Set
		for (const block of cursorBlocks) {
			for (let i = 0; i < block.cells.length; ++i) lines.add(block.line + i)
		}

		// console.time('align blocks at cursors')
		// for (const block of tabstops.columnBlocks) align(block.cells)
		for (const block of cursorBlocks) {
			align(block.cells)
		}
		// console.timeEnd('align blocks at cursors')

		for (const block of tabstops.columnBlocks) {
			const handle = requestAnimationFrame(now => {
				handles.delete(handle)
				if (!cursorBlocks.has(block)) align(block.cells)
			})
			handles.add(handle)
		}
		// console.log('delayed alignments', handles.size)
	}

	function createTabstops(containerElement) {
		const builder = new ElasticTabstopsBuilder()

		// builder.line(lineNumber) must be called with increasing lineNumbers,
		// but Atom may update lines tiles in any order, so we sort them first.
		const lines = containerElement::queryAll(LINE)
		lines.sort((a, b) => a.dataset.screenRow - b.dataset.screenRow)

		for (const line of lines) {
			builder.line(parseInt(line.dataset.screenRow))
			const space = findSpaceIn(line)
			let leadingSpace = space.atStart()	// for first cell

			for (const tab of line::queryAll(TAB)) {
				const tailingSpace = space.before(tab)
				const empty =
					!leadingSpace && !tailingSpace // non-empty if has space
					&&	(tab.classList.contains(LEADING)// empty if tab is leading (without spaces)
						||	tab.previousSibling
							&& tab.previousSibling.nodeType === Node.ELEMENT_NODE
							&& tab.previousSibling.matches(TAB))	// empty if tab follows another tab
				builder.cell({empty, leadingSpace, tailingSpace, tab})
				leadingSpace = space.after(tab)	// for next cell
			}
		}
		return builder.elasticTabstops
	}

	function isTab(node) {
		return node
	}

	function align(cells) {
		// Clear style, and exit if all cells are empty which means the
		// tabs in this column block are not used for alignments but only for
		// indentations.
		let allEmpty = true
		for (const {empty, tab} of cells) {
			tab.style.width = tab.style.paddingLeft = tab.style.paddingRight = null
			allEmpty = allEmpty && empty
		}
		if (allEmpty) return

		// Clear old styles and Unify width of tabs
		for (const cell of cells) {
			const {leadingSpace, tailingSpace, tab} = cell
			const fillStart = fill(leadingSpace)
			const fillEnd = fill(tailingSpace)
			cell.fillStart = fillStart
			cell.fillEnd = fillEnd
			if (fillStart) fillStart.style.paddingLeft = null
			if (fillEnd) fillEnd.style.paddingRight = null
			tab.style.width = '1ch'
		}

		// calculate rightmost position
		let rightmost = 0
		for (const {tab} of cells) {
			const r = tab.getBoundingClientRect().right
			if (r > rightmost) rightmost = r
		}

		for (const {fillStart, fillEnd, tab} of cells) {
			const w = () => Math.ceil(rightmost) - tab.getBoundingClientRect().right
			if (fillStart) {
				fillStart.style.paddingLeft = w() / (fillEnd ? 2 : 1) + 'px'
			}
			;(fillEnd || tab).style.paddingRight = w() + 'px'
			// tab.style.paddingLeft = w() + 'px'
		}
	}

	function fill(space) {
		if (space == null) return null
		const fill = do {
			if (space.nodeType === Node.ELEMENT_NODE) space
			else if (space.parentElement.childElementCount === 0) space.parentElement
			else {
				const e = space.ownerDocument.createElement('span')
				space::replaceWith(e)
				e.appendChild(space)
				e
			}
		}
		fill.classList.add('fill')
		fill.style.paddingLeft = fill.style.paddingRight = null
		return fill
	}

	function findSpaceIn(scopeNode) {
		return {
			before(n) {
				do {
					while (n.previousSibling == null) {
						n = n.parentNode
						if (n == null || n === scopeNode) return null
					}
					n = n.previousSibling
				} while (n.textContent === '')
				if (n.nodeType === Node.ELEMENT_NODE) {
					if (n.matches(TAB)) return null
					if (n.textContent.endsWith(invisibleSpace)) {
						while (n.lastChildElement) {
							n = n.lastChildElement
						}
						if (isInvisibleSpace(n)) return n
					}
				}
				if (n.textContent.endsWith(' ')) {
					while (n.lastChild) {
						n = n.lastChild
						while (n.textContent === '') n = n.previousSibling
					}
					return n
				}
				return null
			},
			after(n) {
				do {
					while (n.nextSibling == null) {
						n = n.parentNode
						if (n == null || n === scopeNode) return null
					}
					n = n.nextSibling
				} while (n.textContent === '')
				if (n.nodeType === Node.ELEMENT_NODE && n.matches(TAB)) return null
				if (n.textContent.startsWith(' ')) {
					while (n.firstChild) {
						n = n.firstChild
						while (n.textContent === '') n = n.nextSibling
					}
					return n
				}
				if (n.textContent.startsWith(invisibleSpace)) {
					while (n.firstChildElement) n = n.firstChildElement
					if (isInvisibleSpace(n)) return n
				}
				return null
			},
			atStart() {
				let n = scopeNode.firstChild
				while (n && n.textContent === '') n = n.nextSibling
				if (n == null) return null
				if (n.textContent.startsWith(' ')) {
					while (n.firstChild) {
						n = n.firstChild
						while (n.textContent === '') n = n.nextSibling
					}
					if (n.parentElement.matches(TAB)) return null
					return n
				}
				if (n.textContent.startsWith(invisibleSpace)) {
					while (n.firstChildElement) n = n.firstChildElement
					if (isInvisibleSpace(n)) return n
				}
				return null
			},
		}
	}

	const scope = editor.getRootScopeDescriptor()
	const invisibleSpace = atom.config.get('editor.invisibles.space', {scope})
	function isInvisibleSpace(element) {
		return element.classList.contains(INVISIBLE) && element.textContent === invisibleSpace
	}
}
