/*
Copyright (c) 2014 Amin Ullah Khan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

/*jslint vars: true, plusplus: true, eqeq: true, devel: true, nomen: true,  regexp: true, indent: 4, maxerr: 50 */
/*global define, brackets, $, window, document, Mustache, PathUtils */

define(function (require, exports, module) {
	"use strict";

	var CommandManager		= brackets.getModule('command/CommandManager'),
		EditorManager		= brackets.getModule('editor/EditorManager'),
		ExtensionUtils		= brackets.getModule('utils/ExtensionUtils'),
		Menus				= brackets.getModule('command/Menus'),
		ProjectManager		= brackets.getModule('project/ProjectManager'),
		PanelManager		= brackets.getModule('view/PanelManager'),
		DocumentManager		= brackets.getModule('document/DocumentManager'),
		Dialogs				= brackets.getModule('widgets/Dialogs'),
        PreferencesManager	= brackets.getModule('preferences/PreferencesManager'),
		AppInit				= brackets.getModule('utils/AppInit');

	var tinycolor	= require('./lib/tinycolor-min');
	var panelHTML	= require('text!html/panel.html');
	ExtensionUtils.loadStyleSheet(module, 'styles/styles.css');

	// Extension config
	var _ExtensionID		= "io.brackets.color-palette",
		_ExtensionLabel		= "Color Palette",
		_ExtensionShortcut	= "Alt-F6";
	
	var _prefs = PreferencesManager.getExtensionPrefs(_ExtensionID);
	_prefs.definePreference('copy-to-clipboard', 'boolean', false);
	_prefs.definePreference('silent', 'boolean', false);
	_prefs.definePreference('format', 'integer', 1);
	
	var projectMenu = Menus.getContextMenu(Menus.ContextMenuIds.PROJECT_MENU);

	var $panel, $image, $icon, panel, actualPath, isVisible, canvas, context, imageData, dimension;

	/**
	 * Entry-Point to the extension
	 */
	function main() {
		imageData = getImageData();

		// Double check || Close
		if (!/\.(jpg|gif|png|ico)$/i.test(imageData.imageName)) {
			Dialogs.showModalDialog(
				_ExtensionID, 'Invalid File!', 'Please open an image (*.png, *.jpg, *.gif, *.ico) file to pick colors from.'
			);
			if (isVisible) showPanel(false);
			return;
		}

		if (actualPath !== imageData.imagePath) {
			actualPath = imageData.imagePath;
			showPanel(true);
			dimension = getImageDimensions();
			$image = $panel.find('.panel-img');
			canvas = $panel.find('.img-canvas')[0];

			$image.css({
				'width': dimension.width + 'px',
				'height': dimension.height + 'px',
				'max-width': dimension.width + 'px',
				'max-height': dimension.height + 'px'
			});
			canvas.width = dimension.width;
			canvas.height = dimension.height;
			context = canvas.getContext('2d');
			context.drawImage($image[0], 0, 0, dimension.width, dimension.height);
		} else {
			actualPath = null;
			showPanel(false);
		}
	}

	// Show/Hide the bottom panel.
	function showPanel(visible) {
		if (visible) {
			isVisible = true;
			if (panel) {
				panel.hide();
				panel.$panel.remove();
			}
			$panel = $(Mustache.render(panelHTML, imageData));
			eventController($panel);
			panel = PanelManager.createBottomPanel(_ExtensionID, $panel, 250);
			$icon.addClass('active');
			panel.show();
			CommandManager.get(_ExtensionID).setChecked(true);
		} else {
			isVisible = false;
			actualPath = null;
			$icon.removeClass('active');
			panel.hide();
			panel.$panel.remove();
			CommandManager.get(_ExtensionID).setChecked(false);
		}
	}

	// Register command.
	var _Command = CommandManager.register(
		_ExtensionLabel, _ExtensionID, main
	);

	/**
	 * Event Controller of the bottom panel
	 */
	function eventController($panel) {
		$panel.find('#color-palette-format')
			.prop('selectedIndex', _prefs.get('format') - 1)
			.change(function(e) {
				_prefs.set('format', parseInt(e.target.value));
			});
		
		if(_prefs.get('copy-to-clipboard')) {
			$panel.find('#color-palette-btn-clipboard').attr('checked', true);
		}
		if(_prefs.get('silent')) {
			$panel.find('#color-palette-btn-silent').attr('checked', true);
		}
		
		$panel.on('click', '.close', function () {
			showPanel(false);
		});
		$panel.on('mousemove', '.panel-img', function (e) {
			updatePreviews(e);
		});
		$panel.on('click', '.panel-img', function (e) {
			insertToEditor(e);
		});
		$panel.on('click', '.preview1, .preview2, .selected, .current', function (e) {
			addToEditor($(this).data('color'));
		});
		$panel.find('#color-palette-btn-clipboard').on('change', function(e) {
			_prefs.set('copy-to-clipboard', e.target.checked);
		});
		$panel.find('#color-palette-btn-silent').on('change', function(e) {
			_prefs.set('silent', e.target.checked);
		});
	}

	/**
	 * Updates both previews
	 */
	function updatePreviews(e) {
		var colors = getRangeColors([e.offsetX, e.offsetY]);

		$panel.find('i.pixel').each(function(i, elem) {
			$(elem).css('background-color', colors[i]);
		});

		// Update Small Preview
		var color = getPixelColor([e.offsetX, e.offsetY]),
			formattedColor = getFormattedColor(color);

		$panel.find('.preview1').css({
			'background-color': tinycolor(color).toRgbString()
		}).data({
			'color': formattedColor
		});
		$panel.find('.current').html(formattedColor).data({
			'color': formattedColor
		});
	}

	// Inserts selected color to the editor
	function insertToEditor(e) {
		var color = getPixelColor([e.offsetX, e.offsetY]),
			formattedColor = getFormattedColor(color);

		$panel.find('.preview2').css({
			'background-color': tinycolor(color).toRgbString()
		}).data({
			'color': formattedColor
		});
		$panel.find('.selected').html(formattedColor).data({
			'color': formattedColor
		});
		if(_prefs.get('copy-to-clipboard')) {
			return;
		}
		addToEditor(formattedColor);
	}

	// Add a string to the focused editor
	function addToEditor(string) {
		var editor = EditorManager.getFocusedEditor();

		if (!editor) {
			if(!_prefs.get('silent')) {
				Dialogs.showModalDialog(_ExtensionID, 'Warning: Focus at the editor!', 'Focus at the editor to paste color value.');
			} else {
				console.warn('['+_ExtensionID+'] Focus at the editor to paste color value.');
			}
		} else {
			var doc = editor.document;
			if (editor.getSelectedText().length > 0) {
				var selection = editor.getSelection();
				if(editor.getSelectedText().substr(0, 1) !== '#' && string.substr(0, 1) === '#' && _prefs.get('format') === 1) {
					doc.replaceRange(string.substr(1), selection.start, selection.end);
				} else {
					doc.replaceRange(string, selection.start, selection.end);
				}
			} else {
				var pos = editor.getCursorPos();
				doc.replaceRange(string, {
					line: pos.line,
					ch: pos.ch
				});
			}
		}
	}

	// Return RGBA of a pixel in the current context
	function getPixelColor(pixel) {
		var imageData = context.getImageData(pixel[0], pixel[1], 1, 1).data;
        return {
            r: imageData[0],
            g: imageData[1],
            b: imageData[2],
            a: imageData[3] / 255
        };
	}
	
	function getRangeColors(pixel) {
		var x = pixel[0] - 7,
			y = pixel[1] - 7;
		var colors = [];
		
		for(var i = 0; i < 225; i++) {
			if(i % 15 === 0 && i !== 0) {
				y++;
				x -= 14;
                colors.push(tinycolor(getPixelColor([x-1, y])).toRgbString());
				continue;
			}
            colors.push(tinycolor(getPixelColor([x, y])).toRgbString());
			x++;
		}
		return colors;
	}

	// Return a formatted color string
	function getFormattedColor(color) {
        var cl = tinycolor(color);

		switch (_prefs.get('format')) {
			case 1:
				if (color.a < 1)
					return cl.toRgbString();
	
				return cl.toHexString();
			case 2:
				return cl.toHslString();
			case 3:
				return cl.toRgbString();
			default:
				return cl.toHexString();
		}
	}

	// Work around, to get the image dimensions :(
	function getImageDimensions() {
		var parts = $('#img-data').html().split(' ');
        return {
            width: parts[0],
            height: parts[2]
        };
	}
	
	function getImageData() {
		var imagePath, imageName;
		
		if(ProjectManager.getSelectedItem()) {
			imagePath = ProjectManager.getSelectedItem()._path;
			imageName = ProjectManager.getSelectedItem()._name;
		} else {
			imagePath = $('#img-path').text();
            imageName = imagePath.split('/').pop();
		}
		return {
			imagePath: imagePath,
			imageName: imageName
		};
	}

	// add to toolbar
	$icon = $('<a>').attr({
		id: 'color-palette-icon',
		href: '#',
		title: _ExtensionLabel,
	}).click(main).appendTo($('#main-toolbar .buttons'));
	
	$(PanelManager).on('editorAreaResize', function() {
        if(isVisible && $panel) {
			var height = panel.$panel.innerHeight() - 48,
				width = panel.$panel.innerWidth() - 175;
			$panel.find('.span10').css({
				'height': height + 'px',
				'width': width + 'px'
			});
		}
    });
	
	// Add to View Menu
	AppInit.appReady(function() {
		var menu = Menus.getMenu(Menus.AppMenuBar.VIEW_MENU);
		CommandManager.register(_ExtensionLabel, _ExtensionID, main);
		menu.addMenuItem(_ExtensionID, _ExtensionShortcut);
	});

	// Add command to project menu.
	$(projectMenu).on("beforeContextMenuOpen", function () {
		var selectedItem = ProjectManager.getSelectedItem();
		projectMenu.removeMenuItem(_ExtensionID);

		if (selectedItem.isFile && /\.(jpg|gif|png|ico)$/i.test(selectedItem.name)) {
			projectMenu.addMenuItem(
				_ExtensionID, _ExtensionShortcut
			);
		}
	});
});