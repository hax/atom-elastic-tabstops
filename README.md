# elastic-tabstops package

An experimental implementation of [Elastic tabstops](http://nickgravgaard.com/elastic-tabstops/) for Atom

![atom-elastic-tabstops-screenshot](https://cloud.githubusercontent.com/assets/159840/13506337/a5680002-e1b8-11e5-926c-d3627e4c20fc.gif)


## Known limitations and issues

1.	~~Cursor positions may be in disorder. Workaround: Edit the line can force
	Atom to rerender it~~ (fixed)
2.	Move cursor up and down become weird... Plan to solve this in the future
3.	Currently we just monkey patch private method to modify the styles
	of the dom nodes, which is not very efficient


NOTE: Elastic tabstops is not easy to implement as a plugin, because it need
touch the core features of the editors. That's why it have little support in mainstream
IDE/editors. I'm still investigating the inner mechanism of Atom. Any kind of suggestions or help are welcome!

## Special feature

*	 Allow right/center alignment
