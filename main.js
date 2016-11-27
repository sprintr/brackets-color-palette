/*
 * Copyright (c) 2014 Amin Ullah Khan
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

/*jslint vars: true, plusplus: true, eqeq: true, devel: true, nomen: true,  regexp: true, indent: 4, maxerr: 50 */
/*global define, brackets, $, window, document, Mustache, PathUtils */

define(function (require, exports, module) {
	"use strict";

	var CommandManager = brackets.getModule('command/CommandManager'),
		EditorManager = brackets.getModule('editor/EditorManager'),
		ExtensionUtils = brackets.getModule('utils/ExtensionUtils'),
		Menus = brackets.getModule('command/Menus'),
		ProjectManager = brackets.getModule('project/ProjectManager'),
		WorkspaceManager = brackets.getModule('view/WorkspaceManager'),
		Dialogs = brackets.getModule('widgets/Dialogs'),
		PreferencesManager = brackets.getModule('preferences/PreferencesManager'),
		AppInit = brackets.getModule('utils/AppInit'),
		Mustache = brackets.getModule("thirdparty/mustache/mustache"),
		tinycolor = require('./lib/tinycolor-min'),
		panelHTML = require('text!html/panel.html'),
		projectMenu = Menus.getContextMenu(Menus.ContextMenuIds.PROJECT_MENU);

	var $panel,
		$icon,
		panel,
		filePath,
		isPanelVisible,
		context,
		selectedPixel = [0, 0],
		currentPixel = [0, 0];

	// Regex to match file names
	var fileTypeRegex = /\.(jpg|jpeg|gif|png|ico|webp)$/i;

	// Extension config
	var EXTENSION_ID = "sprintr.color-palette",
		EXTENSION_LABEL = "Color Palette",
		EXTENSION_SHORTCUT = "Alt-F6";

	// Color formats
	var COLOR_RRGGBB = 1,
		COLOR_RRGGBBAA = 2,
		COLOR_HSL = 3,
		COLOR_RGB = 4;

	var preferences = PreferencesManager.getExtensionPrefs(EXTENSION_ID);
	preferences.definePreference('copyToClipboard', 'boolean', false, {
		description: "true to copy the color to clipboard"
	});
	preferences.definePreference('format', 'number', COLOR_RRGGBB, {
		description: "Format of the selected color"
	});

	/**
	 * Returns the path, name and title of the image
	 * 
	 * @param {String} filePath
	 */
	function getImageInfo(filePath) {
		var name = filePath.substr(filePath.lastIndexOf("/") + 1);
		var title = name;
		if (title.length > 35) {
			title = title.substr(0, 25) + '..' + title.substr(-4);
		}

		return {
			path: filePath,
			name: name,
			title: title
		};
	}

	/**
	 * Toggles the visibility of the panel
	 * 
	 * @param {boolean} visibility
	 * @param {Object} imageInfo
	 */
	function setPanelVisibility(visibility, imageInfo) {
		if (visibility) {
			isPanelVisible = true;
			if (panel) {
				panel.$panel.remove();
				panel.hide();
			}
			$panel = $(Mustache.render(panelHTML, imageInfo));
			addEventListeners($panel);
			panel = WorkspaceManager.createBottomPanel(EXTENSION_ID, $panel, 250);
			panel.show();
			$icon.addClass('active');
			CommandManager.get(EXTENSION_ID).setChecked(true);
		} else {
			isPanelVisible = false;
			panel.hide();
			panel.$panel.remove();
			$icon.removeClass('active');
			CommandManager.get(EXTENSION_ID).setChecked(false);
		}
	}

	/**
	 * Opens the image in the panel
	 * 
	 * @param {Object} imageInfo
	 */
	function openImage(imageInfo) {
		setPanelVisibility(true, imageInfo);

		filePath = imageInfo.path;

		var img = document.createElement("img");
		img.src = imageInfo.path;
		img.onload = function () {
			var width = img.width,
				height = img.height;

			var $image = $panel.find('.panel-img');
			$image.attr('src', imageInfo.path);
			$image.css({
				'width': width + 'px',
				'height': height + 'px',
				'max-width': width + 'px',
				'max-height': height + 'px'
			});

			var canvas = $panel.find('.img-canvas')[0];
			canvas.width = width;
			canvas.height = height;
			context = canvas.getContext("2d");
			context.drawImage($image[0], 0, 0, width, height);
		};
	}

	/**
	 * Closes the image
	 */
	function closeImage() {
		if (isPanelVisible) {
			setPanelVisibility(false);
		}
		filePath = null;
	}

	function main() {
		var selectedItem = ProjectManager.getSelectedItem(),
			imageInfo = getImageInfo(selectedItem._path);

		// Check file via its extension
		if (!fileTypeRegex.test(imageInfo.name)) {
			Dialogs.showModalDialog(EXTENSION_ID, 'Information', 'Please open an image or icon to pick colors from.');
			return closeImage();
		}

		if (filePath !== imageInfo.path) {
			openImage(imageInfo);
		} else {
			closeImage();
		}
	}

	/**
	 * Updates the cursor positions on the image
	 * 
	 * @param {Array<number>} pixel
	 */
	function updateMousePosition(pixel) {
		$panel.find('.mouse-position').html("Left: " + pixel[0] + "px<br>Top: " + pixel[1] + "px");
	}

	/**
	 * Update the pixel grid (Zoom view)
	 * 
	 * @param {Array<number>} pixel
	 */
	function updateCurrentPreviews(pixel) {
		var colors = getColorsForGrid(pixel),
			color = getPixelColor(pixel),
			formattedColor = formatColor(color);

		$panel.find('i.pixel').each(function (i, elem) {
			$(elem).css('background-color', colors[i]);
		});

		// Update Small Preview
		$panel.find('.preview-current').css({
			'background-color': tinycolor(color).toRgbString()
		}).data({
			'color': formattedColor
		});
		$panel.find('.code-view-current').html(formattedColor).data({
			'color': formattedColor
		});
	}

	/**
	 * Updates the preview for selected color
	 * 
	 * @param {Array<number>} pixel
	 */
	function updateSelectedPreviews(pixel) {
		var color = getPixelColor(pixel),
			formattedColor = formatColor(color);

		$panel.find('.preview-selected').css({
			'background-color': tinycolor(color).toRgbString()
		}).data({
			'color': formattedColor
		});
		$panel.find('.code-view-selected').html(formattedColor).data({
			'color': formattedColor
		});
	}

	/**
	 * Inserts text in the active editor
	 * 
	 * @param {String} text
	 */
	function insertTextIntoEditor(text) {
		var editor = EditorManager.getFocusedEditor() || EditorManager.getActiveEditor();
		if (!editor) {
			return null;
		}

		if (!editor.hasFocus()) {
			editor.focus();
		}

		var selectedText = editor.getSelectedText();
		if (selectedText.length > 0) {
			var selection = editor.getSelection();
			if (selectedText.substr(0, 1) !== '#' && text.substr(0, 1) === '#' && preferences.get('format') === COLOR_RRGGBB) {
				editor.document.replaceRange(text.substr(1), selection.start, selection.end);
			} else {
				editor.document.replaceRange(text, selection.start, selection.end);
			}
		} else {
			var pos = editor.getCursorPos();
			editor.document.replaceRange(text, {
				line: pos.line,
				ch: pos.ch
			});
		}
	}

	/**
	 * Copies text to clipboard
	 * 
	 * @param {String} text
	 */
	function copyToClipboard(text) {
		var $textarea = $('<textarea/>').text(text);
		$('body').append($textarea);
		$textarea.select();
		document.execCommand('copy');
		$textarea.remove();
	}

	/**
	 * Add color to editor or clipboard
	 * 
	 * @param {Array<number>} pixel
	 */
	function processSelectedColor(pixel) {
		var color = formatColor(getPixelColor(pixel));
		if (preferences.get('copyToClipboard')) {
			copyToClipboard(color);
			return;
		}
		insertTextIntoEditor(color);
	}

	/**
	 * Adds event listeners to the DOM elements in the $panel
	 */
	function addEventListeners($panel) {
		$panel.on('click', '.close', function () {
			setPanelVisibility(false);
		});

		// Listen to the color format changes
		$panel.find('#color-palette-format')
			.prop('selectedIndex', preferences.get('format') - 1)
			.change(function (e) {
				preferences.set('format', window.parseInt(e.target.value));
				updateCurrentPreviews(currentPixel);
				updateSelectedPreviews(selectedPixel);
			});

		if (preferences.get('copyToClipboard')) {
			$panel.find('#color-palette-btn-clipboard').attr('checked', true);
		}
		$panel.find('#color-palette-btn-clipboard').on('change', function (e) {
			preferences.set('copyToClipboard', e.target.checked);
		});

		// Updates the preview on mousemove and inserts the color on click
		$panel.find('.panel-img')
			.on('mousemove', function (e) {
				currentPixel = [e.offsetX, e.offsetY];
				updateMousePosition(currentPixel);
				updateCurrentPreviews(currentPixel);
			})
			.on('click', function (e) {
				selectedPixel = [e.offsetX, e.offsetY];
				updateSelectedPreviews(selectedPixel);
				processSelectedColor(selectedPixel);
			});

		// Inserts the color into the editor when one of the preview buttons in clicked
		$panel.on('click', '.preview-current, .preview-selected, .code-view-selected, .code-view-current', function (e) {
			insertTextIntoEditor($(this).data('color'));
		});
	}

	/**
	 * Return RGBA of a pixel in the current context
	 * 
	 * @param {Array<number>} pixel
	 */
	function getPixelColor(pixel) {
		var imageData = context.getImageData(pixel[0], pixel[1], 1, 1).data;
		return {
			r: imageData[0],
			g: imageData[1],
			b: imageData[2],
			a: imageData[3] / 255
		};
	}

	// Get colors across the grid
	function getColorsForGrid(pixel) {
		var x = pixel[0] - 7,
			y = pixel[1] - 7,
			colors = [];

		for (var i = 0; i < 225; i++) {
			if (i % 15 === 0 && i !== 0) {
				y++;
				x -= 14;
				colors.push(tinycolor(getPixelColor([x - 1, y])).toRgbString());
				continue;
			}
			colors.push(tinycolor(getPixelColor([x, y])).toRgbString());
			x++;
		}

		return colors;
	}

	/**
	 * Return a formatted color string
	 *
	 * @param {Array<String>} color
	 */
	function formatColor(color) {
		var cl = tinycolor(color);

		switch (preferences.get('format')) {
			case COLOR_RRGGBB:
				return (color.a < 1) ? cl.toRgbString() : cl.toHexString();
			case COLOR_HSL:
				return cl.toHslString();
			case COLOR_RGB:
				return cl.toRgbString();
			default:
				return cl.toHexString();
		}
	}

	// add to toolbar
	$icon = $('<a>').attr({
		id: 'color-palette-icon',
		href: '#',
		title: EXTENSION_LABEL,
	}).click(main).appendTo($('#main-toolbar .buttons'));

	// Add to View Menu
	AppInit.appReady(function () {
		ExtensionUtils.loadStyleSheet(module, 'styles/styles.css');
		CommandManager.register(EXTENSION_LABEL, EXTENSION_ID, main);
		var menu = Menus.getMenu(Menus.AppMenuBar.VIEW_MENU);
		menu.addMenuItem(EXTENSION_ID, EXTENSION_SHORTCUT);
	});

	// Resize
	WorkspaceManager.on('workspaceUpdateLayout', function () {
		if (isPanelVisible && $panel) {
			$panel.find('.span10').css({
				'width': (panel.$panel.innerWidth() - 155) + 'px',
				'height': (panel.$panel.innerHeight() - 52) + 'px'
			});
		}
	});

	// Add command to project menu.
	projectMenu.on("beforeContextMenuOpen", function () {
		var selectedItem = ProjectManager.getSelectedItem();
		projectMenu.removeMenuItem(EXTENSION_ID);

		if (selectedItem.isFile && fileTypeRegex.test(selectedItem.name)) {
			projectMenu.addMenuItem(EXTENSION_ID, EXTENSION_SHORTCUT);
		}
	});
});
