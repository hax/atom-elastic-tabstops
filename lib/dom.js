'use babel'

export function query(relativeSelectors) {
	if (typeof this.query === 'function' && this.query !== query) {
		return this.query(relativeSelectors)
	}
	return this.querySelector(':scope ' + relativeSelectors)
}

export function queryAll(relativeSelectors) {
	if (typeof this.queryAll === 'function' && this.queryAll !== queryAll) {
		return this.queryAll(relativeSelectors)
	}
	return Array.from(this.querySelectorAll(':scope ' + relativeSelectors))
}

export function prepend(...nodes) {
	return insert(nodes, prepend, this)
}

export function append(...nodes) {
	return insert(nodes, append, this)
}

export function before(...nodes) {
	return insert(nodes, before, this)
}
export function after(...nodes) {
	return insert(nodes, after, this)
}

export function replaceWith(...nodes) {
	return insert(nodes, replaceWith, this)
}

function insert(nodes, at, refNode) {
	const name = at.name
	if (typeof refNode[name] === 'function' && refNode[name] !== at) {
		return refNode[name](nodes)
	}

	if (!(name === 'prepend' || name === 'append') && !refNode.parentNode) return

	const doc = refNode.ownerDocument
	const frag = doc.createDocumentFragment()
	for (let node of nodes) {
		if (typeof node === 'string') node = doc.createText(node)
		frag.appendChild(node)
	}
	switch (name) {
		 case 'prepend':	refNode.insertBefore(frag, refNode.firstChild);	break
		 case 'append':	refNode.appendChild(frag);	break
		 case 'before':	refNode.parentNode.insertBefore(frag, refNode);	break
		 case 'after':	refNode.parentNode.insertBefore(frag, refNode.nextSibling);	break
		 case 'replaceWith':	refNode.parentNode.replaceChild(frag, refNode);	break
		 default:	throw 'WTF'
	}
}
