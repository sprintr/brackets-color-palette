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

	// Extension config
	var EXTENSION_ID = "sprintr.brackets-color-palette",
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

	var $panel, $image, $icon, panel, filePath, isPanelVisible, canvas, context, imageInfo, dimension, selectedPixel = [0, 0], currentPixel = [0, 0];

	var fileTypeRegex = /\.(jpg|jpeg|gif|png|ico|webp)$/i;

	/**
	 * Returns the path, name and and the title for the image
	 */
	function getImageInfo() {
		var selectedItem = ProjectManager.getSelectedItem();

		if (selectedItem) {
			var imageInfo = {
				path: selectedItem._path,
				name: selectedItem._name,
				title: selectedItem._name
			};

			if (imageInfo.title.length > 35) {
				imageInfo.title = imageInfo.title.substr(0, 25) + '..' + imageInfo.title.substr(-4);
			}

			return imageInfo;
		}

		return null;
	}

	// Show/Hide the bottom panel.
	function setPanelVisibility(visibility) {
		if (visibility) {
			isPanelVisible = true;
			if (panel) {
				panel.hide();
				panel.$panel.remove();
			}
			$panel = $(Mustache.render(panelHTML, imageInfo));
			addEventListeners($panel);
			panel = WorkspaceManager.createBottomPanel(EXTENSION_ID, $panel, 250);
			$icon.addClass('active');
			panel.show();
			CommandManager.get(EXTENSION_ID).setChecked(true);
		} else {
			isPanelVisible = false;
			filePath = null;
			$icon.removeClass('active');
			panel.hide();
			panel.$panel.remove();
			CommandManager.get(EXTENSION_ID).setChecked(false);
		}
	}

	function main() {
		imageInfo = getImageInfo();

		// Check file via its extension
		if (!fileTypeRegex.test(imageInfo.name)) {
			Dialogs.showModalDialog(EXTENSION_ID, 'Information', 'Please open an image or icon to pick colors from.');
			if (isPanelVisible) {
				setPanelVisibility(false);
			}

			return false;
		}

		if (filePath !== imageInfo.path) {
			setPanelVisibility(true);

			filePath = imageInfo.path;
			dimension = getImageDimensions();
			$image = $panel.find('.panel-img');
			canvas = $panel.find('.img-canvas')[0];

			$image.css({
				'width': dimension.width + 'px',
				'height': dimension.height + 'px',
				'max-width': dimension.width + 'px',
				'max-height': dimension.height + 'px'
			});

			$image[0].onload = function () {
				canvas.width = dimension.width;
				canvas.height = dimension.height;
				context = canvas.getContext('2d');
				context.drawImage($image[0], 0, 0, dimension.width, dimension.height);
			};
		} else {
			filePath = null;
			setPanelVisibility(false);
		}
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

	// Work around, to get the image dimensions :(
	function getImageDimensions() {
		var imageData = $('.active-pane .image-data:visible').html() || $('.image-data:visible').html(),
			segments = imageData.split(' ');
		return {
			width: segments[0],
			height: segments[2]
		};
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
			$panel.find('.main-panel').css({
				'height': (panel.$panel.innerHeight() - 48) + 'px',
				'width': (panel.$panel.innerWidth() - 175) + 'px'
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
