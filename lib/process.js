'use babel'

import ElasticTabstopsBuilder	from './ElasticTabstopsBuilder'
import {queryAll, prepend, after}	from './dom'

const LINE	= 'div.line'
const TAB	= 'span.hard-tab:not(.trailing-whitespace)'
const TABSTOP_START	= 'span.tabstop-start'
const LEADING	= 'span.leading-whitespace'

export default function (textEditorComponent, settings) {

	const c = textEditorComponent.linesComponent
	c.getDomNode().classList.add('elastic-tabstops')
	c._updateTileNodes = c.updateTileNodes
	c.updateTileNodes =	function () {
			this._updateTileNodes()
			update(this.getDomNode())
		}

	const handles = new Set
	function update(containerElement) {
		if (handles.size > 0) {
			console.log('cancle old alignment', handles.size)
			for (const handle of handles) cancelAnimationFrame(handle)
			handles.clear()
		}
		// console.time('create column blocks')
		const blocks = createTabstops(containerElement).columnBlocks
		// console.timeEnd('create column blocks')

		// todo: try to fix cursor position by force align block at current cursor
		for (const block of blocks) {
			const handle = requestAnimationFrame(now => {
				handles.delete(handle)
				align(block.cells)
			})
			handles.add(handle)
		}
	}

	function align(cells) {
		// clear styles and exit if all tabs are for indent not alignment
		let allLeading = true
		for (const {start, end} of cells) {
			start.style.width = end.style.width = end.style.paddingLeft = end.style.paddingRight = null
			if (allLeading) {
				if (end.matches(LEADING)) continue
				else allLeading = false
			}
		}
		if (allLeading) return

		// unify width of all tabs
		for (const {end} of cells) end.style.width = '1ch'

		// calculate rightmost position
		let rightmost = 0
		for (const {end} of cells) {
			const r = end.getBoundingClientRect().right
			if (r > rightmost) rightmost = r
		}

		for (const {start, end} of cells) {
			const fillLeft	= isSpace('after', start)
			const fillRight	= isSpace('before', end)
			if (fillLeft) start.classList.add('fill-left')
			if (fillRight) end.classList.add('fill-right')
			const w = () => Math.ceil(rightmost) - end.getBoundingClientRect().right
			if (fillLeft) {
				if (fillRight) {
					start.style.width = w() / 2 + 'px'
				} else {
					start.style.width = w() + 'px'
				}
			}
			end.style.paddingRight = w() + 'px'
			// end.style.paddingLeft = w() + 'px'
		}
	}

	const SPACE_CHAR = settings.showInvisibles ? settings.invisibleSpace : ' '
	function isSpace(prep, node) {
		const [sibling, test] = {
			before	: ['previousSibling', 'endsWith'],
			after	: ['nextSibling', 'startsWith'],
		}[prep]
		while (node[sibling] == null) {
			node = node.parentNode
			if (node.matches(LINE)) return false
		}
		const text = node[sibling].textContent
		if (text) return text[test](SPACE_CHAR)
		else return isSpace(prep, node[sibling])
	}

	function createTabstops(containerElement) {
		const builder = new ElasticTabstopsBuilder()
		const lineElements = containerElement::queryAll(LINE)
		lineElements.sort((a, b) => a.dataset.screenRow - b.dataset.screenRow)
		for (const line of lineElements) {
			builder.line(line.dataset.screenRow)
			if (!isTabstopStart(line.firstElementChild)) line::prepend(createTabstopStart(line))
			let start = line.firstElementChild
			// old tabstop-start elements will be removed by atom normal updates
			const tabs = line::queryAll(TAB)
			for (const tab of tabs) {
				// tab.classList.add(`tab-fill-${tabLength - tab.textContent.length}`)
				if (!isTabstopStart(tab.nextElementSibling)) tab::after(createTabstopStart(tab))
				builder.cell({start, end: tab})
				start = tab.nextElementSibling
			}
		}
		return builder.elasticTabstops
	}

	function createTabstopStart(refNode) {
		const doc = refNode.ownerDocument
		const e = doc.createElement('span')
		e.classList.add('tabstop-start')
		// e.appendChild(doc.createTextNode(' '))
		return e
	}
	function isTabstopStart(e) {
		return e && e.classList.contains('tabstop-start')
	}
}
