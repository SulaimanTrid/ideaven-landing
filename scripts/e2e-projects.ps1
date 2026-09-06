# Ideaven runtime E2E: project system flows against the live API (:8081).
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:8081'

function J($obj) { $obj | ConvertTo-Json -Compress -Depth 32 }

# Fresh session (cookie jar) — created by the first call via -SessionVariable.
$s = $null

# 0. Health
$h = Invoke-RestMethod -Uri "$base/api/health"
Write-Host ("0 health: " + $h.status)

# 1. Register
$r = Invoke-RestMethod -Uri "$base/api/auth/register" -Method Post -ContentType 'application/json' -SessionVariable s `
    -Body (J @{ email = "e2e-$(Get-Random)@ideaven.test"; username = "e2euser$(Get-Random -Maximum 99999)"; password = 'Correct-Horse-9' })
Write-Host ("1 register: " + $r.user.username + " verified=" + $r.user.emailVerified)

# 2. Create app project
$r = Invoke-RestMethod -Uri "$base/api/projects" -Method Post -ContentType 'application/json' -WebSession $s `
    -Body (J @{ type = 'app'; name = 'E2E Calculator'; description = 'Created by the runtime test' })
$app = $r.project
Write-Host ("2 create app: id=" + $app.id.Substring(0, 8) + "... slug=" + $app.slug + " status=" + $app.status + "/" + $app.visibility)
Write-Host ("  model: v" + $app.modelVersion + " screens=" + $app.model.screens.Count + " startScreen=" + $app.model.navigation.startScreenId + " name=" + $app.model.screens[0].name)

# 3. Create game project
$r = Invoke-RestMethod -Uri "$base/api/projects" -Method Post -ContentType 'application/json' -WebSession $s `
    -Body (J @{ type = 'game'; name = 'E2E Jumper' })
$game = $r.project
Write-Host ("3 create game: type=" + $game.type + " screen=" + $game.model.screens[0].name)

# 4. List
$r = Invoke-RestMethod -Uri "$base/api/projects" -WebSession $s
Write-Host ("4 list: total=" + $r.total + " names=" + (($r.projects | ForEach-Object name) -join ', '))

# 5. Search + sort
$r = Invoke-RestMethod -Uri "$base/api/projects?q=calculator" -WebSession $s
Write-Host ("5 search calculator: total=" + $r.total)
$r = Invoke-RestMethod -Uri "$base/api/projects?sort=name" -WebSession $s
Write-Host ("5 sort=name first=" + $r.projects[0].name)

# 6. Open (records last_opened_at)
$r = Invoke-RestMethod -Uri "$base/api/projects/$($app.id)/open" -Method Post -WebSession $s
Write-Host ("6 open: lastOpenedAt set=" + ($null -ne $r.project.lastOpenedAt))

# 7. Rename (slug must stay)
$r = Invoke-RestMethod -Uri "$base/api/projects/$($app.id)" -Method Patch -ContentType 'application/json' -WebSession $s `
    -Body (J @{ name = 'E2E Calculator Pro' })
Write-Host ("7 rename: " + $r.project.name + " slug-unchanged=" + ($r.project.slug -eq $app.slug))

# 8. Duplicate
$r = Invoke-RestMethod -Uri "$base/api/projects/$($game.id)/duplicate" -Method Post -WebSession $s
$copy = $r.project
Write-Host ("8 duplicate: freshId=" + ($copy.id -ne $game.id) + " name=" + $copy.name)

# 9. Archive + status filters
Invoke-RestMethod -Uri "$base/api/projects/$($copy.id)" -Method Patch -ContentType 'application/json' -WebSession $s `
    -Body (J @{ status = 'archived' }) | Out-Null
$r = Invoke-RestMethod -Uri "$base/api/projects" -WebSession $s
Write-Host ("9 default hides archived: total=" + $r.total)
$r = Invoke-RestMethod -Uri "$base/api/projects?status=archived" -WebSession $s
Write-Host ("9 archived filter: total=" + $r.total + " name=" + $r.projects[0].name)

# 10. Ownership: a second user cannot touch the first user's project
Invoke-RestMethod -Uri "$base/api/auth/register" -Method Post -ContentType 'application/json' -SessionVariable s2 `
    -Body (J @{ email = "e2e-$(Get-Random)@ideaven.test"; username = "intruder$(Get-Random -Maximum 99999)"; password = 'Correct-Horse-9' }) | Out-Null
try {
    Invoke-RestMethod -Uri "$base/api/projects/$($app.id)" -WebSession $s2 | Out-Null
    Write-Host "10 foreign get: FAIL (should have been rejected)"
} catch {
    Write-Host ("10 foreign get blocked: " + $_.Exception.Response.StatusCode.value__)
}
try {
    Invoke-RestMethod -Uri "$base/api/projects/$($app.id)" -Method Delete -WebSession $s2 | Out-Null
    Write-Host "10 foreign delete: FAIL (should have been rejected)"
} catch {
    Write-Host ("10 foreign delete blocked: " + $_.Exception.Response.StatusCode.value__)
}

# 11. Validation: blank name, bad type, unknown field
try { Invoke-RestMethod -Uri "$base/api/projects" -Method Post -ContentType 'application/json' -WebSession $s -Body (J @{ type = 'app'; name = '   ' }) | Out-Null; Write-Host "11 blank name: FAIL" }
catch { Write-Host ("11 blank name rejected: " + $_.Exception.Response.StatusCode.value__) }
try { Invoke-RestMethod -Uri "$base/api/projects" -Method Post -ContentType 'application/json' -WebSession $s -Body (J @{ type = 'website'; name = 'X' }) | Out-Null; Write-Host "11 bad type: FAIL" }
catch { Write-Host ("11 bad type rejected: " + $_.Exception.Response.StatusCode.value__) }

# 12. Delete + verify gone
Invoke-RestMethod -Uri "$base/api/projects/$($copy.id)" -Method Delete -WebSession $s | Out-Null
try { Invoke-RestMethod -Uri "$base/api/projects/$($copy.id)" -WebSession $s | Out-Null; Write-Host "12 delete: FAIL (still readable)" }
catch { Write-Host ("12 deleted project unreadable: " + $_.Exception.Response.StatusCode.value__) }

# 13. Unauthenticated access rejected
try { Invoke-RestMethod -Uri "$base/api/projects" | Out-Null; Write-Host "13 anon list: FAIL" }
catch { Write-Host ("13 anon list rejected: " + $_.Exception.Response.StatusCode.value__) }

# 14. Method guard: PUT /api/projects -> 405 with Allow header
try { Invoke-RestMethod -Uri "$base/api/projects" -Method Put -WebSession $s | Out-Null; Write-Host "14 PUT: FAIL" }
catch {
    $resp = $_.Exception.Response
    $allow = $resp.Headers['Allow']
    Write-Host ("14 wrong method: " + $resp.StatusCode.value__ + " allow=" + $allow)
}

# ---- 15. Builder model save path (PUT /api/projects/{id}/model) ----------------

$model = @{
    schemaVersion = 1
    type          = 'app'
    settings      = @{ theme = 'light' }
    screens       = @(
        @{
            id         = 'screen-home'
            name       = 'Home'
            components = @(
                @{ id = 'c-text-e2e'; type = 'text'; props = @{ text = 'Welcome' }; styles = @{ fontSize = 24 } },
                @{ id = 'c-col-e2e'; type = 'column'; styles = @{ padding = 16; gap = 8 }; children = @(
                    @{ id = 'c-btn-e2e'; type = 'button'; props = @{ label = 'Get started' } }
                ) }
            )
        }
    )
    navigation    = @{ startScreenId = 'screen-home' }
    variables     = @()
    assets        = @()
}

# Create a fresh project to hold the model
$r = Invoke-RestMethod -Uri "$base/api/projects" -Method Post -ContentType 'application/json' -WebSession $s `
    -Body (J @{ type = 'app'; name = 'E2E Builder Model' })
$modelProject = $r.project
$modelId = $modelProject.id

# 15a. Save a valid model with nested components
$r = Invoke-RestMethod -Uri "$base/api/projects/$modelId/model" -Method Put -ContentType 'application/json' -WebSession $s `
    -Body (J @{ model = $model })
Write-Host ("15a model saved: updatedAt-bumped=" + ($r.project.updatedAt -ne $modelProject.updatedAt))

# 15b. The saved model persists through GET (deep structure intact)
$r = Invoke-RestMethod -Uri "$base/api/projects/$modelId" -WebSession $s
$saved = $r.project.model
$homeScreen = $saved.screens | Where-Object { $_.id -eq 'screen-home' }
$nested = $homeScreen.components | Where-Object { $_.id -eq 'c-col-e2e' }
Write-Host ("15b persisted: screens=" + $saved.screens.Count + " nested=" + ($null -ne $nested) + " childProps=" + $nested.children[0].props.label)

# 15c. Invalid models are rejected
$bad1 = @{ model = @{ schemaVersion = 99; type = 'app'; settings = @{}; screens = @(); navigation = @{}; variables = @(); assets = @() } }
try { Invoke-RestMethod -Uri "$base/api/projects/$modelId/model" -Method Put -ContentType 'application/json' -WebSession $s -Body (J $bad1) | Out-Null; Write-Host "15c bad schema: FAIL" }
catch { Write-Host ("15c bad schema rejected: " + $_.Exception.Response.StatusCode.value__) }

$bad2 = @{ model = ($model | ConvertTo-Json -Depth 8 | ConvertFrom-Json) }
$bad2.model.type = 'game'
try { Invoke-RestMethod -Uri "$base/api/projects/$modelId/model" -Method Put -ContentType 'application/json' -WebSession $s -Body (J $bad2) | Out-Null; Write-Host "15d type mismatch: FAIL" }
catch { Write-Host ("15d type mismatch rejected: " + $_.Exception.Response.StatusCode.value__) }

# 15e. Foreign user cannot save someone else's model
try { Invoke-RestMethod -Uri "$base/api/projects/$modelId/model" -Method Put -ContentType 'application/json' -WebSession $s2 -Body (J @{ model = $model }) | Out-Null; Write-Host "15e foreign save: FAIL" }
catch { Write-Host ("15e foreign save blocked: " + $_.Exception.Response.StatusCode.value__) }

# 15f. Anonymous save blocked
try { Invoke-RestMethod -Uri "$base/api/projects/$modelId/model" -Method Put -ContentType 'application/json' -WebSession $s2 -Body (J @{ model = $model }) | Out-Null; Write-Host "15f foreign save: FAIL" }
catch { Write-Host ("15f foreign save blocked: " + $_.Exception.Response.StatusCode.value__) }

# ---- 16. Block logic (Blocks engine) --------------------------------------------

# 16a. Save a model with real block logic: a button click handler with an
#      if + set-property + navigate, plus a dangling component reference
#      (allowed by design; diagnostics territory, never data loss).
$logicModel = @{
    schemaVersion = 1
    type          = 'app'
    settings      = @{ theme = 'light' }
    screens       = @(
        @{
            id         = 'screen-home'
            name       = 'Home'
            components = @(
                @{ id = 'c-btn-e2e2'; type = 'button'; props = @{ label = 'Go' } },
                @{ id = 'c-txt-e2e2'; type = 'text'; props = @{ text = 'Score' } }
            )
            logic      = @{
                handlers = @(
                    @{
                        id          = 'h-e2e-1'
                        componentId = 'c-btn-e2e2'
                        event       = 'click'
                        body        = @(
                            @{
                                id = 'b-e2e-1'; kind = 'statement'; type = 'if'
                                slots   = @{ condition = @{ id = 'b-e2e-2'; kind = 'expression'; type = 'equals'; slots = @{ a = @{ id = 'b-e2e-3'; kind = 'expression'; type = 'get-property'; inputs = @{ componentId = 'c-txt-e2e2'; property = 'text' } }; b = @{ id = 'b-e2e-4'; kind = 'expression'; type = 'text'; inputs = @{ value = '10' } } } } }
                                children = @(
                                    @{ id = 'b-e2e-5'; kind = 'statement'; type = 'show-message'; slots = @{ message = @{ id = 'b-e2e-6'; kind = 'expression'; type = 'text'; inputs = @{ value = 'Ten!' } } } }
                                )
                            },
                            @{ id = 'b-e2e-7'; kind = 'statement'; type = 'set-property'; inputs = @{ componentId = 'c-deleted-ref'; property = 'text' }; slots = @{ value = @{ id = 'b-e2e-8'; kind = 'expression'; type = 'text'; inputs = @{ value = 'x' } } } },
                            @{ id = 'b-e2e-9'; kind = 'statement'; type = 'navigate'; inputs = @{ screenId = 'screen-home' } }
                        )
                    },
                    @{ id = 'h-e2e-2'; componentId = $null; event = 'initialize'; body = @() }
                )
            }
        }
    )
    navigation    = @{ startScreenId = 'screen-home' }
    variables     = @( @{ id = 'v-e2e-1'; name = 'score'; type = 'text' } )
    assets        = @()
}

$r = Invoke-RestMethod -Uri "$base/api/projects/$modelId/model" -Method Put -ContentType 'application/json' -WebSession $s `
    -Body (J @{ model = $logicModel })
Write-Host "16a logic model saved"

$r = Invoke-RestMethod -Uri "$base/api/projects/$modelId" -WebSession $s
$savedLogic = $r.project.model.screens[0].logic
$handler1 = $savedLogic.handlers | Where-Object { $_.id -eq 'h-e2e-1' }
$ifBlock = $handler1.body | Where-Object { $_.id -eq 'b-e2e-1' }
Write-Host ("16b logic persisted: handlers=" + $savedLogic.handlers.Count + " ifChildren=" + $ifBlock.children.Count + " screenHandler=" + ($null -ne ($savedLogic.handlers | Where-Object { $_.componentId -eq $null })))

# 16c. Duplicate handler IDs rejected
$badLogic = $logicModel | ConvertTo-Json -Depth 12 | ConvertFrom-Json
$h2 = $badLogic.screens[0].logic.handlers[1]
$h2.id = 'h-e2e-1'
try { Invoke-RestMethod -Uri "$base/api/projects/$modelId/model" -Method Put -ContentType 'application/json' -WebSession $s -Body (J @{ model = $badLogic }) | Out-Null; Write-Host "16c duplicate handler: FAIL" }
catch { Write-Host ("16c duplicate handler rejected: " + $_.Exception.Response.StatusCode.value__) }

# 16d. Block with unknown kind rejected
$badKind = $logicModel | ConvertTo-Json -Depth 12 | ConvertFrom-Json
$badKind.screens[0].logic.handlers[0].body[0].kind = 'widget'
try { Invoke-RestMethod -Uri "$base/api/projects/$modelId/model" -Method Put -ContentType 'application/json' -WebSession $s -Body (J @{ model = $badKind }) | Out-Null; Write-Host "16d bad kind: FAIL" }
catch { Write-Host ("16d bad kind rejected: " + $_.Exception.Response.StatusCode.value__) }

# 16e. if/else (elseChildren) accepted and persisted; duplicate across branches rejected
$elseModel = $logicModel | ConvertTo-Json -Depth 32 | ConvertFrom-Json
$ifBlock = $elseModel.screens[0].logic.handlers[0].body[0]
$ifBlock | Add-Member -NotePropertyName elseChildren -NotePropertyValue @(
    @{ id = 'b-e2e-e1'; kind = 'statement'; type = 'show-message'; slots = @{ message = @{ id = 'b-e2e-e2'; kind = 'expression'; type = 'text'; inputs = @{ value = 'Else ran' } } } }
) -Force
$debugJson = J @{ model = $elseModel }
$debugJson | Out-File -FilePath "$env:TEMP\e2e-16e.json" -Encoding utf8
try { $null = $debugJson | ConvertFrom-Json; Write-Host "16e local roundtrip OK" } catch { Write-Host ("16e local roundtrip FAILED: " + $_.Exception.Message) }
$r = Invoke-RestMethod -Uri "$base/api/projects/$modelId/model" -Method Put -ContentType 'application/json' -WebSession $s -Body $debugJson
Write-Host "16e else model saved"
$r = Invoke-RestMethod -Uri "$base/api/projects/$modelId" -WebSession $s
$elseSaved = $r.project.model.screens[0].logic.handlers[0].body[0]
Write-Host ("16f else persisted: elseChildren=" + $elseSaved.elseChildren.Count + " msg=" + $elseSaved.elseChildren[0].slots.message.inputs.value)

$dupElse = $elseModel | ConvertTo-Json -Depth 32 | ConvertFrom-Json
$dupElse.screens[0].logic.handlers[0].body[0].elseChildren[0].id = 'b-e2e-5'
try { Invoke-RestMethod -Uri "$base/api/projects/$modelId/model" -Method Put -ContentType 'application/json' -WebSession $s -Body (J @{ model = $dupElse }) | Out-Null; Write-Host "16g dup across branches: FAIL" }
catch { Write-Host ("16g dup across branches rejected: " + $_.Exception.Response.StatusCode.value__) }

# ---- 17. Custom screen code (code-sync safety net) ------------------------------

$customModel = $elseModel | ConvertTo-Json -Depth 32 | ConvertFrom-Json
$customModel.screens[0] | Add-Member -NotePropertyName code -NotePropertyValue 'export function registerHome(api) { api.show("custom"); } // custom' -Force
$r = Invoke-RestMethod -Uri "$base/api/projects/$modelId/model" -Method Put -ContentType 'application/json' -WebSession $s -Body (J @{ model = $customModel })
Write-Host "17a custom code saved"
$r = Invoke-RestMethod -Uri "$base/api/projects/$modelId" -WebSession $s
$storedCode = $r.project.model.screens[0].code
Write-Host ("17b custom code persisted verbatim: " + ($storedCode -like '*api.show(`"custom`")*'))
# Clearing it again keeps the model valid
$cleared = $customModel | ConvertTo-Json -Depth 32 | ConvertFrom-Json
$cleared.screens[0].code = $null
$r = Invoke-RestMethod -Uri "$base/api/projects/$modelId/model" -Method Put -ContentType 'application/json' -WebSession $s -Body (J @{ model = $cleared })
$r = Invoke-RestMethod -Uri "$base/api/projects/$modelId" -WebSession $s
Write-Host ("17c custom code cleared: " + ($null -eq $r.project.model.screens[0].code))

Write-Host "E2E DONE"
