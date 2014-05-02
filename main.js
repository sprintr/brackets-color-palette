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

	var CommandManager	= brackets.getModule('command/CommandManager'),
		EditorManager	= brackets.getModule('editor/EditorManager'),
		ExtensionUtils	= brackets.getModule('utils/ExtensionUtils'),
		Menus			= brackets.getModule('command/Menus'),
		ProjectManager	= brackets.getModule('project/ProjectManager'),
		PanelManager	= brackets.getModule('view/PanelManager'),
		DocumentManager	= brackets.getModule('document/DocumentManager'),
		Dialogs			= brackets.getModule('widgets/Dialogs');

	var tinycolor		= require('./lib/tinycolor-min');
	var panelHTML		= require('text!html/panel.html');
	ExtensionUtils.loadStyleSheet(module, 'styles/styles.css');

	// Extension config
	var _ExtensionID		= "io.brackets.color-palette",
		_ExtensionLabel		= "Open as Color Palette",
		_ExtensionShortcut	= "Ctrl-F6";

	var projectMenu = Menus.getContextMenu(Menus.ContextMenuIds.PROJECT_MENU);

	var $panel, $image, $icon;
	var panel, actualPath, isVisible, canvas, context,
		format = 1,
		imageData = {
			imageName: null,
			imagePath: null
		};

	/**
	 * Entry-Point to the extension
	 */
	function main() {

		imageData = {
			imageName: ProjectManager.getSelectedItem()._name,
			imagePath: ProjectManager.getSelectedItem()._path
		};

		// Double check || Close
		if (!/\.(jpg|gif|png)$/i.test(imageData.imageName)) {
			Dialogs.showModalDialog(
				_ExtensionID,
				'Invalid File!',
				'Please open an image (*.png, *.jpg, *.gif) file to pick colors from.'
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
				'width': dimension[0] + 'px',
				'height': dimension[1] + 'px',
				'max-width': dimension[0] + 'px',
				'max-height': dimension[1] + 'px'
			});

			canvas.width = dimension[0];
			canvas.height = dimension[1];

			context = canvas.getContext('2d');
			context.drawImage($image[0], 0, 0, dimension[0], dimension[1]);
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
				$panel.remove();
			}
				
			$panel = $(Mustache.render(panelHTML, imageData));
			eventController($panel);
			panel = PanelManager.createBottomPanel(_ExtensionID, $panel, 270);
			$icon.addClass('active');
			panel.show();
		} else {
			isVisible = false;
			actualPath = null;
			$icon.removeClass('active');
			format = 1;
			panel.hide();
			$panel.remove();
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
			e.preventDefault();
			e.stopPropagation();
			updatePreviews(e);
		});
		$panel.on('click', '.panel-img', function (e) {
			e.preventDefault();
			e.stopPropagation();
			insertToEditor(e);
		});
		$panel.on('click', '.preview1, .preview2', function (e) {
			addToEditor($(this).data('color'));
		});
	}

	/**
	 * Updates both previews
	 */
	function updatePreviews(e) {
		var coords = [
			30 - e.offsetX,
			30 - e.offsetY
		];

		// Update Large Preview
		$panel.find('.preview').css({
			'background-position': coords[0] + 'px ' + coords[1] + 'px'
		});

		// Update Small Preview
		var color = getPixelColor([e.offsetX, e.offsetY]),
			formattedColor = getFormattedColor(color, format);

		$panel.find('.preview1').css({
			'background-color': 'rgba(' + color[0] + ', ' + color[1] + ', ' + color[2] + ', ' + color[3] + ')'
		}).data({
			'color': formattedColor
		});
		$panel.find('.code-view').html(formattedColor);
	}

	// Inserts selected color to the editor
	function insertToEditor(e) {
		var color = getPixelColor([e.offsetX, e.offsetY]),
			formattedColor = getFormattedColor(color, format);

		$panel.find('.preview2').css({
			'background-color': 'rgba(' + color[0] + ', ' + color[1] + ', ' + color[2] + ', ' + color[3] + ')'
		}).data({
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
		return [
			imageData[0],
			imageData[1],
			imageData[2], (imageData[3] / 255)
		];
	}

	// Return a formatted color string
	function getFormattedColor(color, format) {
		var cl = tinycolor('RGBA(' + color[0] + ', ' + color[1] + ', ' + color[2] + ', ' + color[3] + ')');

		switch (format) {
			case 1:
				if (color[3] < 1)
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
		return [
			parts[0],
			parts[2]
		];
	}
	
	// Resize image preview
	function resizePanel() {
		if(isVisible && $panel) {
			var height = panel.$panel.innerHeight() - 48,
				width = panel.$panel.innerWidth() - 190;
			$panel.find('.span10').css({
				'height': height + 'px',
				'width': width + 'px'
			});
		}
	}

	// add to toolbar
	$icon = $('<a>').attr({
		id: 'color-palette-icon',
		href: '#',
		title: _ExtensionLabel,
	}).click(main).appendTo($('#main-toolbar .buttons'));
	
	$(PanelManager).on('editorAreaResize', resizePanel);

	// Add command to project menu.
	$(projectMenu).on("beforeContextMenuOpen", function (e) {
		var selectedItem = ProjectManager.getSelectedItem();
		projectMenu.removeMenuItem(_ExtensionID);

		if (selectedItem.isFile && /\.(jpg|gif|png)$/i.test(selectedItem.name)) {
			projectMenu.addMenuItem(
				_ExtensionID, _ExtensionShortcut
			);
		}
	});
});