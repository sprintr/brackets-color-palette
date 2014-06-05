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
        PreferencesManager	= brackets.getModule('preferences/PreferencesManager');

	var tinycolor	= require('./lib/tinycolor-min');
	var panelHTML	= require('text!html/panel.html');
	ExtensionUtils.loadStyleSheet(module, 'styles/styles.css');

	// Extension config
	var _ExtensionID		= "io.brackets.color-palette",
		_ExtensionLabel		= "Open as Color Palette",
		_ExtensionShortcut	= "Ctrl-F6";
	
	var _prefs = PreferencesManager.getExtensionPrefs(_ExtensionID);
	_prefs.definePreference('copy-to-clipboard', 'boolean', false);
	_prefs.definePreference('silent', 'boolean', false);
	
	var projectMenu = Menus.getContextMenu(Menus.ContextMenuIds.PROJECT_MENU);

	var $panel, $image, $icon, panel, actualPath, isVisible, canvas, context, format = 1, imageData;

	/**
	 * Entry-Point to the extension
	 */
	function main() {
		imageData = getImageData();

		// Double check || Close
		if (!/\.(jpg|gif|png|ico)$/i.test(imageData.imageName)) {
			Dialogs.showModalDialog(
				_ExtensionID,
				'Invalid File!',
				'Please open an image (*.png, *.jpg, *.gif, *.ico) file to pick colors from.'
			);
			if (isVisible) showPanel(false);
			return;
		}

		if (actualPath !== imageData.imagePath) {
			actualPath = imageData.imagePath;
			showPanel(true);
			var dimension = getImageDimensions();
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
				format = 1;
			}
				
			$panel = $(Mustache.render(panelHTML, imageData));
			eventController($panel);
			panel = PanelManager.createBottomPanel(_ExtensionID, $panel, 250);
			$icon.addClass('active');
			panel.show();
		} else {
			isVisible = false;
			actualPath = null;
			format = 1;
			$icon.removeClass('active');
			panel.hide();
			panel.$panel.remove();
		}
	}

	// Register command.
	var _Command = CommandManager.register(
		_ExtensionLabel,
		_ExtensionID,
		main
	);

	/**
	 * Event Controller of the bottom panel
	 */
	function eventController($panel) {
		$panel.on('click', '.close', function () {
			showPanel(false);
		});
		$panel.on('change', '.color-model', function () {
			format = parseInt($(this).val());
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
			formattedColor = getFormattedColor(color, format);

		$panel.find('.preview1').css({
			'background-color': tinycolor(color).toHexString()
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
			formattedColor = getFormattedColor(color, format);

		$panel.find('.preview2').css({
			'background-color': tinycolor(color).toHexString()
		}).data({
			'color': formattedColor
		});
		$panel.find('.selected').html(formattedColor).data({
			'color': formattedColor
		});
		addToEditor(formattedColor);
	}

	// Add a string to the focused editor
	function addToEditor(string) {
		var editor = EditorManager.getFocusedEditor();

		if (!editor) {
			Dialogs.showModalDialog(_ExtensionID, 'Focus!', 'Focus at the text editor');
		} else {
			var doc = editor.document;
			if (editor.getSelectedText().length > 0) {
				var selection = editor.getSelection();
				doc.replaceRange(string, selection.start, selection.end);
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
                colors.push(tinycolor(getPixelColor([x-1, y])).toHexString());
				continue;
			}
            colors.push(tinycolor(getPixelColor([x, y])).toHexString());
			x++;
		}
		return colors;
	}

	// Return a formatted color string
	function getFormattedColor(color, format) {
        var cl = tinycolor(color);

		switch (format) {
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