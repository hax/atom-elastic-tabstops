{CompositeDisposable} = require 'atom'
process = require './process'

module.exports = ElasticTabstops =
	subscriptions: null

	activate: (state) ->
		console.log 'activated!'
		@subscriptions = new CompositeDisposable
		atom.workspace.observeTextEditors @apply

	deactivate: ->
		@subscriptions.dispose()

	apply: (editor) ->
		return if editor.getSoftTabs()
		textEditorComponent = atom.views.getView(editor).component
		process textEditorComponent,
			tabLength: editor.getTabLength()
			showInvisibles: atom.config.get('editor.showInvisibles')
			invisibleSpace: atom.config.get('editor.invisibles.space')
