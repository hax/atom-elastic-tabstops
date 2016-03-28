'use babel'

import {CompositeDisposable}	from 'atom'
import ElasticTabstopsBuilder	from './ElasticTabstopsBuilder'
import {queryAll, prepend, after, replaceWith}	from './dom'

const LINE	= 'div.line'
const TAB	= 'span.hard-tab:not(.trailing-whitespace)'

const LEADING	= 'leading-whitespace'
const INVISIBLE	= 'invisible-character'


const subscriptions = new CompositeDisposable()
export function activate(state) {
	// console.log('activate', state)
	subscriptions.add(
		atom.workspace.observeTextEditors(observeEditor)
	)
}
export function deactivate() {
	// console.log('deactivate')
	subscriptions.dispose()

	for (const editor of atom.workspace.getTextEditors()) {
		const editorElement = atom.views.getView(editor)
		editorElement.classList.remove('elastic-tabstops')

		// unpatch lines component
		const c = editorElement.component.linesComponent
		if (c._updateTileNodes) c.updateTileNodes = c._updateTileNodes
	}
}

function observeEditor(editor) {
	// console.log('observe editor')

	if (editor.getSoftTabs()) {
		console.log('Elastic tabstops require hard tabs')
		return
	}

	const editorElement = atom.views.getView(editor)
	editorElement.classList.add('elastic-tabstops')

	// monkey patch lines component
	const c = editorElement.component.linesComponent
	c._updateTileNodes = c.updateTileNodes
	c.updateTileNodes =	function () {
			this._updateTileNodes()
			update(this.getDomNode())
		}

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

		const presenter = editorElement.component.presenter
		const cache = presenter.getLinesYardstick().pixelPositionsByLineIdAndColumn
		for (const line of lines) {
			const id = presenter.lineIdForScreenRow(line)
			delete cache[id]
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
