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

define(function(require, exports, module) {
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
        tinycolor = require('./lib/tinycolor-min'),
        panelHTML = require('text!html/panel.html');

    // Extension config
    var EXTENSION_ID = "io.brackets.color-palette",
        EXTENSION_LABEL = "Color Palette",
        EXTENSION_SHORTCUT = "Alt-F6";

    // Color formats
    var COLOR_HEX = 1,
        COLOR_HSL = 2,
        COLOR_RGB = 3;

    var projectMenu = Menus.getContextMenu(Menus.ContextMenuIds.PROJECT_MENU);

    var preferences = PreferencesManager.getExtensionPrefs(EXTENSION_ID);
    preferences.definePreference('copy-to-clipboard', 'boolean', false);
    preferences.definePreference('format', 'integer', 1);

    var $panel, $image, $icon, panel, actualPath, isVisible, canvas, context, imageData, dimension, selectedPixel = [0, 0], currentPixel = [0, 0];

    var fileTypeRegex = /\.(jpg|jpeg|gif|png|ico|webp)$/i;

	/**
	 * Returns the path, name and and the title for the image
	 */
    function getImageInfo() {
        if (ProjectManager.getSelectedItem()) {
            // imageData.path = ProjectManager.getSelectedItem()._path;
            // imageData.name = ProjectManager.getSelectedItem()._name;
            // imageData.title = imageData.name;

            var imageInfo = {
                path: ProjectManager.getSelectedItem()._path,
                name: ProjectManager.getSelectedItem()._name,
                title: ProjectManager.getSelectedItem()._name
            };

            if (imageInfo.title.length > 35) {
                imageInfo.title = imageInfo.title.substr(0, 25) + '..' + imageInfo.title.substr(-4);
            }

            return imageInfo;
        }

        return null;
        // if (imageData && imageData.title.length > 35) {
        //     imageData.title = imageData.title.substr(0, 25) + '..' + imageData.title.substr(-4);
        // }
        // return imageData;
    }

    // Show/Hide the bottom panel.
    function setPanelVisibility(visible) {
        if (visible) {
            isVisible = true;
            if (panel) {
                panel.hide();
                panel.$panel.remove();
            }
            $panel = $(Mustache.render(panelHTML, imageData));
            _EventController($panel);
            panel = WorkspaceManager.createBottomPanel(EXTENSION_ID, $panel, 250);
            $icon.addClass('active');
            panel.show();
            CommandManager.get(EXTENSION_ID).setChecked(true);
        } else {
            isVisible = false;
            actualPath = null;
            $icon.removeClass('active');
            panel.hide();
            panel.$panel.remove();
            CommandManager.get(EXTENSION_ID).setChecked(false);
        }
    }

    // Event Controller of the bottom panel
    function _EventController($panel) {
        $panel.find('#color-palette-format')
            .prop('selectedIndex', preferences.get('format') - 1)
            .change(function(e) {
                preferences.set('format', window.parseInt(e.target.value));
                updatePreviews(currentPixel);
                updateSelectedPreviews(selectedPixel);
            });

        if (preferences.get('copy-to-clipboard')) {
            $panel.find('#color-palette-btn-clipboard').attr('checked', true);
        }
        $panel.on('click', '.close', function() {
            setPanelVisibility(false);
        });
        $panel.find('.panel-img')
            .on('mousemove', function(e) {
                currentPixel = [e.offsetX, e.offsetY];
                updatePreviews(currentPixel);
            })
            .on('click', function(e) {
                selectedPixel = [e.offsetX, e.offsetY];
                updateSelectedPreviews(selectedPixel);
                processSelectedColor(selectedPixel);
            });
        $panel.on('click', '.preview1, .preview2, .selected, .current', function(e) {
            insertStringToEditor($(this).data('color'));
        });
        $panel.find('#color-palette-btn-clipboard').on('change', function(e) {
            preferences.set('copy-to-clipboard', e.target.checked);
        });
    }

    function _ExecMain() {
        imageData = getImageInfo();

        // Double check || Close
        if (!fileTypeRegex.test(imageData.name)) {
            Dialogs.showModalDialog(EXTENSION_ID, 'Information', 'Please open an image or icon to pick colors from.');
            if (isVisible) {
                setPanelVisibility(false);
            }
            return false;
        }

        if (actualPath !== imageData.path) {
            actualPath = imageData.path;
            setPanelVisibility(true);
            dimension = getImageDimensions();
            $image = $panel.find('.panel-img');
            canvas = $panel.find('.img-canvas')[0];

            $image.css({
                'width': dimension.width + 'px',
                'height': dimension.height + 'px',
                'max-width': dimension.width + 'px',
                'max-height': dimension.height + 'px'
            });

            $image[0].onload = function() {
                canvas.width = dimension.width;
                canvas.height = dimension.height;
                context = canvas.getContext('2d');
                context.drawImage($image[0], 0, 0, dimension.width, dimension.height);
            };
        } else {
            actualPath = null;
            setPanelVisibility(false);
        }
    }

    // Updates the preview for current color
    function updatePreviews(pixel) {
        var colors = getGridColors(pixel);

        $panel.find('i.pixel').each(function(i, elem) {
            $(elem).css('background-color', colors[i]);
        });

        // Update Small Preview
        var color = getPixelColor(pixel),
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

    // Updates the preview for selected color
    function updateSelectedPreviews(pixel) {
        var color = getPixelColor(pixel),
            formattedColor = getFormattedColor(color);

        $panel.find('.preview2').css({
            'background-color': tinycolor(color).toRgbString()
        }).data({
            'color': formattedColor
        });
        $panel.find('.selected').html(formattedColor).data({
            'color': formattedColor
        });
    }

    // Add color to editor or clipboard
    function processSelectedColor(pixel) {
        var color = getFormattedColor(getPixelColor(pixel));
        if (preferences.get('copy-to-clipboard')) {
            copyToClipboard(color);
            return;
        }
        insertStringToEditor(color);
    }

    // Add a string to the editor
    function insertStringToEditor(string) {
        var editor = EditorManager.getFocusedEditor() || EditorManager.getActiveEditor();
        if (!editor) {
            return false;
        }

        if (!editor.hasFocus()) {
            editor.focus();
        }

        if (editor.getSelectedText().length > 0) {
            var selection = editor.getSelection();
            if (editor.getSelectedText().substr(0, 1) !== '#' && string.substr(0, 1) === '#' && preferences.get('format') === 1) {
                editor.document.replaceRange(string.substr(1), selection.start, selection.end);
            } else {
                editor.document.replaceRange(string, selection.start, selection.end);
            }
        } else {
            var pos = editor.getCursorPos();
            editor.document.replaceRange(string, {
                line: pos.line,
                ch: pos.ch
            });
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

    // Get colors across the grid
    function getGridColors(pixel) {
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

    // Return a formatted color string
    function getFormattedColor(color) {
        var cl = tinycolor(color);
        switch (preferences.get('format')) {
            case COLOR_HEX:
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

    // Copy text to clipboard
    function copyToClipboard(text) {
        var $textarea = $('<textarea/>').text(text);
        $('body').append($textarea);
        $textarea.select();
        document.execCommand('copy');
        $textarea.remove();
    }

    // add to toolbar
    $icon = $('<a>').attr({
        id: 'color-palette-icon',
        href: '#',
        title: EXTENSION_LABEL,
    }).click(_ExecMain).appendTo($('#main-toolbar .buttons'));

    // Add to View Menu
    AppInit.appReady(function() {
        ExtensionUtils.loadStyleSheet(module, 'styles/styles.css');
        CommandManager.register(EXTENSION_LABEL, EXTENSION_ID, _ExecMain);
        var menu = Menus.getMenu(Menus.AppMenuBar.VIEW_MENU);
        menu.addMenuItem(EXTENSION_ID, EXTENSION_SHORTCUT);
    });

    // Resize
    WorkspaceManager.on('workspaceUpdateLayout', function() {
        if (isVisible && $panel) {
            $panel.find('.span10').css({
                'height': (panel.$panel.innerHeight() - 48) + 'px',
                'width': (panel.$panel.innerWidth() - 175) + 'px'
            });
        }
    });

    // Add command to project menu.
    projectMenu.on("beforeContextMenuOpen", function() {
        var selectedItem = ProjectManager.getSelectedItem();
        projectMenu.removeMenuItem(EXTENSION_ID);

        if (selectedItem.isFile && fileTypeRegex.test(selectedItem.name)) {
            projectMenu.addMenuItem(EXTENSION_ID, EXTENSION_SHORTCUT);
        }
    });
});
