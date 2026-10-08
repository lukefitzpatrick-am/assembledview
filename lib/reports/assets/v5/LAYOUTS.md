# v5 deck layouts

Slide layouts and masters in `lib/reports/assets/v5/am-template-deck-16x9.pptx`.
Positions and sizes are the shape's own off and ext values, in English Metric Units.
A value of inherited means the layout does not set that edge and the master supplies it.

## Theme

### ppt/theme/theme1.xml

Name: Assembled Media 05b. Used by ppt/presentation.xml, ppt/slideMasters/slideMaster1.xml.

| Slot | Typeface |
| --- | --- |
| majorFont latin | Plus Jakarta Sans ExtraBold |
| minorFont latin | Plus Jakarta Sans |

| Slot | Colour |
| --- | --- |
| dk1 | #0F1D13 |
| lt1 | #FFFFFF |
| dk2 | #246646 |
| lt2 | #EFE9DF |
| accent1 | #B5D337 |
| accent2 | #49C7EB |
| accent3 | #246646 |
| accent4 | #4E8F6A |
| accent5 | #CFC8BA |
| accent6 | #1A2620 |
| hlink | #246646 |
| folHlink | #4E8F6A |

### ppt/theme/theme2.xml

Name: Office Theme. Used by ppt/notesMasters/notesMaster1.xml.

| Slot | Typeface |
| --- | --- |
| majorFont latin | Aptos Display |
| minorFont latin | Aptos |

| Slot | Colour |
| --- | --- |
| dk1 | #000000 (windowText) |
| lt1 | #FFFFFF (window) |
| dk2 | #0E2841 |
| lt2 | #E8E8E8 |
| accent1 | #156082 |
| accent2 | #E97132 |
| accent3 | #196B24 |
| accent4 | #0F9ED5 |
| accent5 | #A02B93 |
| accent6 | #4EA72E |
| hlink | #467886 |
| folHlink | #96607D |

## Comparison with lib/brand/tokens.json

Expected fonts from tokens.json: Plus Jakarta Sans (sans) and Instrument Serif (serif).

The check uses themes referenced by the slide master or the presentation.

ppt/theme/theme1.xml (Assembled Media 05b). Used by ppt/presentation.xml, ppt/slideMasters/slideMaster1.xml.

Difference: missing Instrument Serif. The name appears in 25 XML parts, outside the theme font scheme.

Difference: also names Plus Jakarta Sans ExtraBold.

majorFont latin: Plus Jakarta Sans ExtraBold.

minorFont latin: Plus Jakarta Sans.

ppt/theme/theme2.xml (Office Theme) is in the package and is not referenced by the slide master. Its fonts are Aptos Display, Aptos.

Expected colours from tokens.json: sand, ink, forest, lime, sky.

sand #EFE9DF is in the theme.

ink #0F1D13 is in the theme.

forest #246646 is in the theme.

lime #B5D337 is in the theme.

sky #49C7EB is in the theme.

Other scheme colours, outside sand, ink, forest, lime and sky: ppt/theme/theme1.xml lt1 #FFFFFF (tokens.json white); ppt/theme/theme1.xml accent4 #4E8F6A (tokens.json forestLight); ppt/theme/theme1.xml accent5 #CFC8BA (tokens.json context); ppt/theme/theme1.xml accent6 #1A2620 (tokens.json panel); ppt/theme/theme1.xml folHlink #4E8F6A (tokens.json forestLight).

## Slide master 1

Part: `ppt/slideMasters/slideMaster1.xml`.
Name: (unnamed).

| Type | Idx | Name | X (EMU) | Y (EMU) | Width (EMU) | Height (EMU) |
| --- | --- | --- | --- | --- | --- | --- |
| sldNum | 4294967295 | Slide Number Placeholder 0 | 11091672 | 6336792 | 548640 | 274320 |

## Slide layout 1

Part: `ppt/slideLayouts/slideLayout1.xml`.
Name: DEFAULT.

No placeholders.

## Slide layout 2

Part: `ppt/slideLayouts/slideLayout2.xml`.
Name: Cover - Black.

| Type | Idx | Name | X (EMU) | Y (EMU) | Width (EMU) | Height (EMU) |
| --- | --- | --- | --- | --- | --- | --- |
| body | 101 | Text 0 | 2788920 | 457200 | 365760 | 457200 |
| pic | 102 | Text 0 | 3383280 | 320040 | 2011680 | 777240 |

## Slide layout 3

Part: `ppt/slideLayouts/slideLayout3.xml`.
Name: Cover - Sand.

| Type | Idx | Name | X (EMU) | Y (EMU) | Width (EMU) | Height (EMU) |
| --- | --- | --- | --- | --- | --- | --- |
| body | 101 | Text 0 | 2788920 | 457200 | 365760 | 457200 |
| pic | 102 | Text 0 | 3383280 | 320040 | 2011680 | 777240 |

## Slide layout 4

Part: `ppt/slideLayouts/slideLayout4.xml`.
Name: Breaker - Black.

| Type | Idx | Name | X (EMU) | Y (EMU) | Width (EMU) | Height (EMU) |
| --- | --- | --- | --- | --- | --- | --- |
| pic | 100 | Text 0 | 548640 | 640080 | 3108960 | 6217920 |

## Slide layout 5

Part: `ppt/slideLayouts/slideLayout5.xml`.
Name: Breaker - Sand.

| Type | Idx | Name | X (EMU) | Y (EMU) | Width (EMU) | Height (EMU) |
| --- | --- | --- | --- | --- | --- | --- |
| pic | 100 | Text 0 | 548640 | 640080 | 3108960 | 6217920 |

## Slide layout 6

Part: `ppt/slideLayouts/slideLayout6.xml`.
Name: Statement - Black.

| Type | Idx | Name | X (EMU) | Y (EMU) | Width (EMU) | Height (EMU) |
| --- | --- | --- | --- | --- | --- | --- |
| body | 100 | Text 0 | 1280160 | 1463040 | 9601200 | 3291840 |
| body | 101 | Text 0 | 1280160 | 5029200 | 9601200 | 457200 |
| sldNum | 4294967295 | Slide Number Placeholder 0 | 11091672 | 6336792 | 548640 | 274320 |

## Slide layout 7

Part: `ppt/slideLayouts/slideLayout7.xml`.
Name: Statement - Sky.

| Type | Idx | Name | X (EMU) | Y (EMU) | Width (EMU) | Height (EMU) |
| --- | --- | --- | --- | --- | --- | --- |
| body | 100 | Text 0 | 1280160 | 1463040 | 9601200 | 3291840 |
| body | 101 | Text 0 | 1280160 | 5029200 | 9601200 | 457200 |
| sldNum | 4294967295 | Slide Number Placeholder 0 | 11091672 | 6336792 | 548640 | 274320 |

## Slide layout 8

Part: `ppt/slideLayouts/slideLayout8.xml`.
Name: Title Only - White.

| Type | Idx | Name | X (EMU) | Y (EMU) | Width (EMU) | Height (EMU) |
| --- | --- | --- | --- | --- | --- | --- |
| title | 100 | Text 0 | 548640 | 457200 | 11064240 | 1143000 |
| sldNum | 4294967295 | Slide Number Placeholder 0 | 11091672 | 6336792 | 548640 | 274320 |

## Slide layout 9

Part: `ppt/slideLayouts/slideLayout9.xml`.
Name: Title Only - Sand.

| Type | Idx | Name | X (EMU) | Y (EMU) | Width (EMU) | Height (EMU) |
| --- | --- | --- | --- | --- | --- | --- |
| title | 100 | Text 0 | 548640 | 457200 | 11064240 | 1143000 |
| sldNum | 4294967295 | Slide Number Placeholder 0 | 11091672 | 6336792 | 548640 | 274320 |

## Slide layout 10

Part: `ppt/slideLayouts/slideLayout10.xml`.
Name: Title Only - Black.

| Type | Idx | Name | X (EMU) | Y (EMU) | Width (EMU) | Height (EMU) |
| --- | --- | --- | --- | --- | --- | --- |
| title | 100 | Text 0 | 548640 | 457200 | 11064240 | 1143000 |
| sldNum | 4294967295 | Slide Number Placeholder 0 | 11091672 | 6336792 | 548640 | 274320 |

## Slide layout 11

Part: `ppt/slideLayouts/slideLayout11.xml`.
Name: Title and Text.

| Type | Idx | Name | X (EMU) | Y (EMU) | Width (EMU) | Height (EMU) |
| --- | --- | --- | --- | --- | --- | --- |
| title | 100 | Text 0 | 548640 | 457200 | 11064240 | 1143000 |
| body | 101 | Text 0 | 548640 | 1828800 | 11064240 | 4251960 |
| sldNum | 4294967295 | Slide Number Placeholder 0 | 11091672 | 6336792 | 548640 | 274320 |

## Slide layout 12

Part: `ppt/slideLayouts/slideLayout12.xml`.
Name: Photo and Text.

| Type | Idx | Name | X (EMU) | Y (EMU) | Width (EMU) | Height (EMU) |
| --- | --- | --- | --- | --- | --- | --- |
| title | 100 | Text 0 | 548640 | 457200 | 5852160 | 2011680 |
| body | 101 | Text 0 | 548640 | 2651760 | 5669280 | 3383280 |
| pic | 102 | Text 0 | 6949440 | 548640 | 3291840 | 6309360 |

## Slide layout 13

Part: `ppt/slideLayouts/slideLayout13.xml`.
Name: Thank You - Black.

| Type | Idx | Name | X (EMU) | Y (EMU) | Width (EMU) | Height (EMU) |
| --- | --- | --- | --- | --- | --- | --- |
| title | 101 | Text 0 | 548640 | 2011680 | 6583680 | 2377440 |
| body | 102 | Text 0 | 548640 | 4572000 | 6035040 | 1554480 |
| pic | 103 | Text 0 | 9006840 | 914400 | 1417320 | 5943600 |

## Slide layout 14

Part: `ppt/slideLayouts/slideLayout14.xml`.
Name: Blank - White.

| Type | Idx | Name | X (EMU) | Y (EMU) | Width (EMU) | Height (EMU) |
| --- | --- | --- | --- | --- | --- | --- |
| sldNum | 4294967295 | Slide Number Placeholder 0 | 11091672 | 6336792 | 548640 | 274320 |

## Slide layout 15

Part: `ppt/slideLayouts/slideLayout15.xml`.
Name: Blank - Sand.

| Type | Idx | Name | X (EMU) | Y (EMU) | Width (EMU) | Height (EMU) |
| --- | --- | --- | --- | --- | --- | --- |
| sldNum | 4294967295 | Slide Number Placeholder 0 | 11091672 | 6336792 | 548640 | 274320 |

## Slide layout 16

Part: `ppt/slideLayouts/slideLayout16.xml`.
Name: Blank - Black.

| Type | Idx | Name | X (EMU) | Y (EMU) | Width (EMU) | Height (EMU) |
| --- | --- | --- | --- | --- | --- | --- |
| sldNum | 4294967295 | Slide Number Placeholder 0 | 11091672 | 6336792 | 548640 | 274320 |

## Slide layout 17

Part: `ppt/slideLayouts/slideLayout17.xml`.
Name: Agenda.

| Type | Idx | Name | X (EMU) | Y (EMU) | Width (EMU) | Height (EMU) |
| --- | --- | --- | --- | --- | --- | --- |
| title | 100 | Text 0 | 548640 | 457200 | 4480560 | 2194560 |
| body | 101 | Text 0 | 548640 | 2834640 | 4206240 | 1828800 |
| body | 103 | Text 1 | 5852160 | 658368 | 868680 | 621792 |
| body | 104 | Text 1 | 6812280 | 658368 | 4800600 | 621792 |
| body | 106 | Text 2 | 5852160 | 1572768 | 868680 | 621792 |
| body | 107 | Text 2 | 6812280 | 1572768 | 4800600 | 621792 |
| body | 109 | Text 3 | 5852160 | 2487168 | 868680 | 621792 |
| body | 110 | Text 3 | 6812280 | 2487168 | 4800600 | 621792 |
| body | 112 | Text 4 | 5852160 | 3401568 | 868680 | 621792 |
| body | 113 | Text 4 | 6812280 | 3401568 | 4800600 | 621792 |
| body | 115 | Text 5 | 5852160 | 4315968 | 868680 | 621792 |
| body | 116 | Text 5 | 6812280 | 4315968 | 4800600 | 621792 |
| body | 118 | Text 6 | 5852160 | 5230368 | 868680 | 621792 |
| body | 119 | Text 6 | 6812280 | 5230368 | 4800600 | 621792 |
| sldNum | 4294967295 | Slide Number Placeholder 0 | 11091672 | 6336792 | 548640 | 274320 |

## Slide layout 18

Part: `ppt/slideLayouts/slideLayout18.xml`.
Name: Two Column.

| Type | Idx | Name | X (EMU) | Y (EMU) | Width (EMU) | Height (EMU) |
| --- | --- | --- | --- | --- | --- | --- |
| title | 100 | Text 0 | 548640 | 457200 | 11064240 | 1143000 |
| body | 103 | Text 2 | 548640 | 2194560 | 5303520 | 502920 |
| body | 104 | Text 2 | 548640 | 2834640 | 5303520 | 3200400 |
| body | 105 | Text 2 | 6309360 | 2194560 | 5303520 | 502920 |
| body | 106 | Text 2 | 6309360 | 2834640 | 5303520 | 3200400 |
| sldNum | 4294967295 | Slide Number Placeholder 0 | 11091672 | 6336792 | 548640 | 274320 |

## Slide layout 19

Part: `ppt/slideLayouts/slideLayout19.xml`.
Name: Three Cards.

| Type | Idx | Name | X (EMU) | Y (EMU) | Width (EMU) | Height (EMU) |
| --- | --- | --- | --- | --- | --- | --- |
| title | 100 | Text 0 | 548640 | 457200 | 11064240 | 1143000 |
| body | 103 | Text 2 | 868680 | 3108960 | 2865120 | 777240 |
| body | 104 | Text 2 | 868680 | 3977640 | 2865120 | 1874520 |
| body | 107 | Text 4 | 4648200 | 3108960 | 2865120 | 777240 |
| body | 108 | Text 4 | 4648200 | 3977640 | 2865120 | 1874520 |
| body | 111 | Text 6 | 8427720 | 3108960 | 2865120 | 777240 |
| body | 112 | Text 6 | 8427720 | 3977640 | 2865120 | 1874520 |
| sldNum | 4294967295 | Slide Number Placeholder 0 | 11091672 | 6336792 | 548640 | 274320 |

## Slide layout 20

Part: `ppt/slideLayouts/slideLayout20.xml`.
Name: Four Cards.

| Type | Idx | Name | X (EMU) | Y (EMU) | Width (EMU) | Height (EMU) |
| --- | --- | --- | --- | --- | --- | --- |
| title | 100 | Text 0 | 548640 | 457200 | 11064240 | 1143000 |
| body | 103 | Text 2 | 868680 | 3108960 | 1920240 | 777240 |
| body | 104 | Text 2 | 868680 | 3977640 | 1920240 | 1874520 |
| body | 107 | Text 4 | 3703320 | 3108960 | 1920240 | 777240 |
| body | 108 | Text 4 | 3703320 | 3977640 | 1920240 | 1874520 |
| body | 111 | Text 6 | 6537960 | 3108960 | 1920240 | 777240 |
| body | 112 | Text 6 | 6537960 | 3977640 | 1920240 | 1874520 |
| body | 115 | Text 8 | 9372600 | 3108960 | 1920240 | 777240 |
| body | 116 | Text 8 | 9372600 | 3977640 | 1920240 | 1874520 |
| sldNum | 4294967295 | Slide Number Placeholder 0 | 11091672 | 6336792 | 548640 | 274320 |

