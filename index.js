import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import fs from 'fs';
import multer from 'multer';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer({
    dest: 'uploads/', // temporary directory for uploaded files
    limits: {
        fileSize: 20 * 1024 * 1024, // 20MB limit
    },
    fileFilter: (req, file, cb) => {
        // Allow specific file types
        const allowedTypes = [
            'application/json',
            'application/pdf', 
            'text/plain',
            'text/csv',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg',
            'image/png',
            'image/webp'
        ];
        
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Unsupported file type'), false);
        }
    }
});

app.post('/generate/json', async (req, res) => {
    try {
        const { systemPrompt, prompt } = req.body;

        const rule = `You are a JSON-to-XML mapping transformer.
        Rules:
        - Always start output with a single short intro line: "Here’s the code:"
        - Then immediately open a fenced code block with: \`\`\`xml
        - Always end the block with: \`\`\`
        - Mapping rules:
          * Root object → <json:object>
          * For each key → <json:property name="KEY" value="\${JSON_PATH}" />
          * Never insert static values, always use dynamic placeholders like \${...}.
          * Arrays → <json:array> with <Core:forEach items="\${PARENT_PATH.ARRAY}" var="item">,
            then map properties inside as <json:property name="..." value="\${item.FIELD}" />
        - Preserve all JSON key names exactly.
        `;

        const userPrompt = `create json jsob object. ${rule} ${prompt}`;

        const { text } = await generateText({
            model: google('gemini-2.5-flash'),
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
        });

        res.json({
            success: true,
            data: text
        });

    } catch (err) {
        console.error('Gemini API Error:', err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});


app.post('/api/rewrite', async (req, res) => {
    try {
        const { code, instructions, language = '' } = req.body;
        const systemPrompt = `You are a ${language ? language + " " : ""}programmer that replaces <FILL_ME> part with the right code. Only output the code that replaces <FILL_ME> part. Do not add any explanation or markdown.`;
        const userPrompt = `${code}<FILL_ME>${instructions}`;

        const { text } = await generateText({
            model: google('gemini-2.5-flash'),
            messages: [
                {
                    role: "system",
                    content: systemPrompt,
                },
                { 
                    role: "user", 
                    content: userPrompt 
                },
            ],
        });

        res.json({
            success: true,
            data: text
        });

    } catch (err) {
        console.error('Rewrite API Error:', err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

app.post('/api/deluge', async (req, res) => {
    try {
        const { prompt, language = 'Deluge' } = req.body;
        
        const systemPrompt = `You are a ${language} programming expert. Generate complete, working Deluge script code based on the user's requirements. 

        IMPORTANT RULES:
        1. Only output the actual Deluge code - no explanations, markdown, or comments about what the code does
        2. Use proper Deluge syntax and functions
        3. Include all necessary variable declarations and logic
        4. Make sure the code is complete and executable
        5. Use proper Deluge date functions like eomonth(), workDaysBetween(), etc.
        6. Follow Deluge naming conventions and best practices
        7. Do not include any text outside of the actual code`;

        const userPrompt = `Generate a complete Deluge script for: ${prompt}`;

        const { text } = await generateText({
            model: google('gemini-2.5-flash'),
            messages: [
                {
                    role: "system",
                    content: systemPrompt,
                },
                { 
                    role: "user", 
                    content: userPrompt 
                },
            ],
        });

        res.json({
            success: true,
            data: text
        });

    } catch (err) {
        console.error('Deluge API Error:', err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

app.post('/generate/app', upload.single('file'), async (req, res) => {
    let tempFilePath = null;
    
    try {
        // Check if file was uploaded
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        const { prompt, mediaType } = req.body;
        tempFilePath = req.file.path;
        
        // Validate file exists
        if (!fs.existsSync(tempFilePath)) {
            return res.status(400).json({
                success: false,
                error: 'Uploaded file not found'
            });
        }

        // Check if it's a Postman collection JSON file
        const fileContent = fs.readFileSync(tempFilePath, 'utf8');
        let isPostmanCollection = false;
        let collectionData = null;

        try {
            collectionData = JSON.parse(fileContent);
            // Check if it has Postman collection structure
            if (collectionData.info && collectionData.item && Array.isArray(collectionData.item)) {
                isPostmanCollection = true;
            }
        } catch (parseError) {
            // Not a valid JSON file, continue with regular processing
        }

        if (isPostmanCollection) {
            try {
                // Process Postman collection and generate the specific response format
                // console.log('Processing Postman collection...');
                const response = await generatePostmanCollectionResponse(collectionData);
                // console.log('Generated response:', JSON.stringify(response, null, 2));
                
                // Clean up temporary file
                fs.unlinkSync(tempFilePath);
                
                // Generate AI use case explanation
                const useCasePrompt = `Analyze this service for workflow automation use case. Service: ${response.service.displayName}, Endpoints: ${response.endpoints.length}, Names: ${response.endpoints.map(ep => ep.displayName).join(', ')}. Provide a brief 1-2 sentence use case explanation for business automation.`;
                
                let message = "This service provides API endpoints for workflow automation.";
                try {
                    const { text } = await generateText({
                        model: google('gemini-2.5-flash'),
                        messages: [
                            { role: 'system', content: 'You are a business analyst. Provide concise use case explanations for API services in workflow automation.' },
                            { role: 'user', content: useCasePrompt }
                        ],
                    });
                    message = text.trim();
                } catch (aiError) {
                    console.log('AI use case generation failed:', aiError.message);
                }
                
                return res.json({
                    success: true,
                    data: response,
                    serviceName: response.service.displayName,
                    message: message,
                });
            } catch (postmanError) {
                console.error('Postman collection processing error:', postmanError);
                fs.unlinkSync(tempFilePath);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to process Postman collection: ' + postmanError.message
                });
            }
        }

        // Use the uploaded file's MIME type or fallback to provided mediaType
        const finalMediaType = req.file.mimetype || mediaType || 'application/pdf';
        
        const { text } = await generateText({
            model: google('gemini-2.5-flash'),
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: prompt || 'Analyze this document and provide insights.',
                        },
                        {
                            type: 'file',
                            data: fs.readFileSync(tempFilePath),
                            mediaType: finalMediaType,
                        },
                    ],
                },
            ],
        });

        // Clean up temporary file
        fs.unlinkSync(tempFilePath);

        res.json({
            success: true,
            data: text
        });

    } catch (err) {
        console.error('Generate App API Error:', err);
        
        // Clean up temporary file in case of error
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
            } catch (cleanupErr) {
                console.error('Error cleaning up temp file:', cleanupErr);
            }
        }

        // Handle specific errors
        let errorMessage = err.message;
        let statusCode = 500;

        if (err.message.includes('Unsupported file type')) {
            statusCode = 415;
            errorMessage = 'Unsupported file type';
        } else if (err.message.includes('File too large')) {
            statusCode = 413;
            errorMessage = 'File too large';
        } else if (err.message.includes('No file uploaded')) {
            statusCode = 400;
        }

        res.status(statusCode).json({
            success: false,
            error: errorMessage
        });
    }
});

// Function to generate Postman collection response format
async function generatePostmanCollectionResponse(collectionData) {
    console.log('Starting Postman collection processing...');
    console.log('Collection name:', collectionData.info?.name);
    console.log('Number of items:', collectionData.item?.length);
    
    const originalCollectionName = collectionData.info?.name || 'API Collection';
    const originalDescription = collectionData.info?.description || '';
    
    // Use AI to generate sorted summary for collection name and description
    const aiPrompt = `You are analyzing a Postman API collection for a workflow automation app. Generate a professional service name and description that would be suitable for business users.

    Collection Analysis:
    - Original Name: ${originalCollectionName}
    - Original Description: ${originalDescription}
    - Total Endpoints: ${collectionData.item?.length || 0}
    - GET Endpoints: ${collectionData.item?.filter(item => item.request?.method?.toUpperCase() === 'GET').length || 0}

    Requirements:
    1. Service Name: 2-4 words, professional, business-friendly
    2. Description: 1-2 sentences explaining what this service does for users
    3. Focus on business value and user benefits
    4. Use clear, non-technical language when possible

    Examples:
    - "Trading Platform API" instead of "Zerodha Kite RESTful API"
    - "Financial Data Service" instead of "Stock Market API"
    - "User Management System" instead of "Authentication API"

    IMPORTANT: Respond ONLY with valid JSON, no markdown, no explanations:
    {
      "serviceName": "concise business name here",
      "description": "clear business description here"
    }`;

    let aiGeneratedName = originalCollectionName;
    let aiGeneratedDescription = originalDescription;

    try {
        const { text } = await generateText({
            model: google('gemini-2.5-flash'),
            messages: [
                {
                    role: 'system',
                    content: 'You are a business analyst for a workflow automation platform. Generate professional, business-friendly names and descriptions for API services. Always respond with valid JSON only. No markdown, no explanations, no code blocks.',
                },
                {
                    role: 'user',
                    content: aiPrompt,
                },
            ],
        });

        // Parse AI response - handle markdown-wrapped JSON
        const cleanText = text.replace(/```json\s*|\s*```/g, '').trim();
        const aiResponse = JSON.parse(cleanText);
        aiGeneratedName = aiResponse.serviceName || originalCollectionName;
        aiGeneratedDescription = aiResponse.description || originalDescription;
    } catch (aiError) {
        console.log('AI generation failed, using original values:', aiError.message);
    }

    const collectionName = aiGeneratedName;
    const collectionDescription = aiGeneratedDescription;
    
    // Extract endpoints from collection items
    const endpoints = [];
    const resources = [];
    const triggers = [];
    const actions = [];
    
    if (collectionData.item && Array.isArray(collectionData.item)) {
        console.log('Processing', collectionData.item.length, 'items...');
        for (let index = 0; index < collectionData.item.length; index++) {
            const item = collectionData.item[index];
            if (item.request) {
                const endpointName = item.name || `Endpoint ${index + 1}`;
                const method = item.request.method || 'GET';
                console.log(`Item ${index + 1}: ${endpointName} (${method})`);
                // Only include GET methods
                if (String(method).toUpperCase() !== 'GET') {
                    console.log(`Skipping ${endpointName} - not a GET request`);
                    continue;
                }
                const url = item.request.url?.raw || item.request.url || '';
                
                // Generate AI summary for endpoint name and description
                const endpointAiPrompt = `You are analyzing an API endpoint for a workflow automation app. Generate a professional endpoint name and description that business users can understand.

                Endpoint Analysis:
                - Original Name: ${item.name || 'Unnamed Endpoint'}
                - HTTP Method: ${method}
                - URL Path: ${url}
                - Original Description: ${item.description || 'No description'}

                Requirements:
                1. Endpoint Name: 2-4 words, action-oriented, business-friendly
                2. Description: 1 sentence explaining what this endpoint does for users
                3. Focus on business functionality, not technical details
                4. Use clear, non-technical language

                Examples:
                - "Get User Profile" instead of "Profile"
                - "Check Account Balance" instead of "Margins"
                - "View Order History" instead of "Orders"
                - "Retrieve Holdings" instead of "Holdings"

                IMPORTANT: Respond ONLY with valid JSON, no markdown, no explanations:
                {
                  "endpointName": "business-friendly name here",
                  "description": "clear business description here"
                }`;

                let aiEndpointName = item.name || `Endpoint ${index + 1}`;
                let aiEndpointDescription = item.description || '';

                try {
                    const { text: endpointText } = await generateText({
                        model: google('gemini-2.5-flash'),
                        messages: [
                            {
                                role: 'system',
                                content: 'You are a business analyst for a workflow automation platform. Generate professional, business-friendly names and descriptions for API endpoints. Always respond with valid JSON only. No markdown, no explanations, no code blocks.',
                            },
                            {
                                role: 'user',
                                content: endpointAiPrompt,
                            },
                        ],
                    });

                    // Parse AI response - handle markdown-wrapped JSON
                    const cleanEndpointText = endpointText.replace(/```json\s*|\s*```/g, '').trim();
                    const endpointAiResponse = JSON.parse(cleanEndpointText);
                    aiEndpointName = endpointAiResponse.endpointName || item.name || `Endpoint ${index + 1}`;
                    aiEndpointDescription = endpointAiResponse.description || item.description || '';
                } catch (endpointAiError) {
                    console.log('Endpoint AI generation failed, using original values:', endpointAiError.message);
                }
                
                // Create endpoint configuration
                const endpoint = {
                    "isDataHandler": "FALSE",
                    "endpointConfig": [],
                    "mappedscopes": [],
                    "displayName": aiEndpointName,
                    "supportPaging": "FALSE",
                    "workflowConfig": {
                        "zoomLevel": 1,
                        "name": "workflow",
                        "working": {
                            "wires": [
                                {
                                    "tgt": {
                                        "terminal": "in",
                                        "moduleId": 4
                                    },
                                    "src": {
                                        "terminal": "out",
                                        "moduleId": 0
                                    }
                                },
                                {
                                    "tgt": {
                                        "terminal": "in",
                                        "moduleId": 2
                                    },
                                    "src": {
                                        "terminal": "out",
                                        "moduleId": 1
                                    }
                                },
                                {
                                    "tgt": {
                                        "terminal": "in",
                                        "moduleId": 3
                                    },
                                    "src": {
                                        "terminal": "error",
                                        "moduleId": 1
                                    }
                                },
                                {
                                    "tgt": {
                                        "terminal": "in",
                                        "moduleId": 1
                                    },
                                    "src": {
                                        "terminal": "out",
                                        "moduleId": 4
                                    }
                                }
                            ],
                            "treeInfo": {
                                "0": {
                                    "children": [4]
                                },
                                "1": {
                                    "children": [2, 3]
                                },
                                "2": {
                                    "children": []
                                },
                                "3": {
                                    "children": []
                                },
                                "4": {
                                    "children": [1]
                                }
                            },
                            "orphans": {
                                "wires": [],
                                "modules": []
                            },
                            "modules": [
                                {
                                    "config": {
                                        "xtype": "StartContainer",
                                        "name": "0",
                                        "position": [300, 50],
                                        "moduleId": 0,
                                        "headline": "Start",
                                        "key": "start_krj2p"
                                    },
                                    "value": {}
                                },
                                {
                                    "config": {
                                        "xtype": "HttpRequestContainer",
                                        "name": "4",
                                        "position": [300, 270],
                                        "moduleId": 1,
                                        "headline": "HTTP Request",
                                        "key": "HttpRequest_p280e"
                                    },
                                    "value": {
                                        "headers": [
                                            {
                                                "paramName": "Content-Type",
                                                "paramValue": "application/json"
                                            }
                                        ],
                                        "allFields": {
                                            "bodyType": "raw",
                                            "enableHeaders": "false",
                                            "convertXmltoJSON": "false",
                                            "contentType": "application/json",
                                            "outputVariableName": "HTTPRequest"
                                        },
                                        "rawType": "json",
                                        "requestType": method.toUpperCase(),
                                        "urlText": url,
                                        "bodyParams": [],
                                        "rawData": "${transformation_4}",
                                        "params": []
                                    }
                                },
                                {
                                    "config": {
                                        "xtype": "ReturnContainer",
                                        "name": "5",
                                        "position": [300, 380],
                                        "moduleId": 2,
                                        "headline": "Return Data",
                                        "key": "ReturnData_a4ghp"
                                    },
                                    "value": {
                                        "allFields": {
                                            "returnValue": "${HTTPRequest.body}",
                                            "returnType": "text",
                                            "status": "success"
                                        }
                                    }
                                },
                                {
                                    "config": {
                                        "xtype": "ErrorHandlerContainer",
                                        "name": "66",
                                        "position": [651, 380],
                                        "moduleId": 3,
                                        "headline": "Return Error",
                                        "key": "ErrorHandler_u25gf"
                                    },
                                    "value": {
                                        "allFields": {
                                            "errorMessage": "${HTTPRequest.body}",
                                            "errorCode": "${HTTPRequest.status}"
                                        }
                                    }
                                },
                                {
                                    "config": {
                                        "xtype": "JellyTransformerContainer",
                                        "name": "9",
                                        "position": [300, 160],
                                        "moduleId": 4,
                                        "headline": "Transformation",
                                        "key": "Jelly_ps4tf"
                                    },
                                    "value": {
                                        "allFields": {
                                            "jelly": "<json:object>\n<json:property name=\"method\" value=\"${resource.method}\" />\n<json:property name=\"url\" value=\"${resource.url}\" />\n</json:object>",
                                            "editorType": "json",
                                            "outputVariableName": "transformation_4"
                                        }
                                    }
                                }
                            ]
                        },
                        "isHttpConfigModified": true,
                        "language": "VisualWorkflow"
                    },
                    "description": aiEndpointDescription,
                    "disabled": "FALSE",
                    "type": 0,
                    "linkName": `endpoint_${index + 1}`
                };
                
                endpoints.push(endpoint);
                
                // Create resource
                const resource = {
                    "staticFields": [
                        {
                            "inputParams": {
                                "helpText": "",
                                "isLabelField": false,
                                "name": "method",
                                "isDataTypeField": false,
                                "zf_has_lists": false,
                                "isIdField": false,
                                "isTypeField": false,
                                "label": "Method",
                                "fieldType": 0,
                                "isMandatory": true,
                                "placeHolder": method,
                                "fieldId": 539890000001296100 + index
                            },
                            "type": 0,
                            "category": 1
                        },
                        {
                            "inputParams": {
                                "helpText": "",
                                "isLabelField": false,
                                "name": "url",
                                "isDataTypeField": false,
                                "zf_has_lists": false,
                                "isIdField": false,
                                "isTypeField": false,
                                "label": "URL",
                                "fieldType": 0,
                                "isMandatory": true,
                                "placeHolder": url,
                                "fieldId": 539890000001296101 + index
                            },
                            "type": 0,
                            "category": 1
                        }
                    ],
                    "displayName": aiEndpointName,
                    "description": aiEndpointDescription,
                    "linkName": `resource_${index + 1}`
                };
                
                resources.push(resource);
                
                // Create trigger
                const trigger = {
                    "isDeprecated": "FALSE",
                    "notes": "",
                    "triggerStaticFieldsMapping": [],
                    "triggerConfig": {
                        "triggerScheduleType": 1,
                        "is_custom_polling_key": false,
                        "dateFormat": "DD-MMM-YYYY HH:mm:ss",
                        "poll_order": 0,
                        "polling_field_type": 0,
                        "extraParams": [],
                        "api": `endpoint_${index + 1}`,
                        "config": {},
                        "is_random_uuid_field": false,
                        "poll_by": "0",
                        "has_secondary_polling_key": false
                    },
                    "displayName": aiEndpointName,
                    "description": aiEndpointDescription,
                    "resourceName": `resource_${index + 1}`,
                    "type": 0,
                    "linkName": `trigger_${index + 1}`,
                    "isDataTypeEnabled": "TRUE",
                    "triggerSubResFieldMapping": {},
                    "triggerStaticFields": [],
                    "documentLink": "",
                    "disabled": "FALSE"
                };
                
                triggers.push(trigger);
                
                // Create action
                const action = {
                    "isDeprecated": "FALSE",
                    "notes": "",
                    "displayName": aiEndpointName,
                    "actionStaticFieldsMapping": [
                        {
                            "orderNo": 1,
                            "isOutputField": true,
                            "defaultValue": "",
                            "enable": false,
                            "isInputField": true,
                            "label": "Method",
                            "fieldType": 0,
                            "linkName": "method",
                            "isMandatory": true,
                            "isHidden": false
                        },
                        {
                            "orderNo": 2,
                            "isOutputField": true,
                            "defaultValue": "",
                            "enable": false,
                            "isInputField": true,
                            "label": "URL",
                            "fieldType": 0,
                            "linkName": "url",
                            "isMandatory": true,
                            "isHidden": false
                        }
                    ],
                    "description": aiEndpointDescription,
                    "resourceName": `resource_${index + 1}`,
                    "type": 0,
                    "linkName": `action_${index + 1}`,
                    "isDataTypeEnabled": "TRUE",
                    "actionSubResFieldMapping": {},
                    "actionConfig": {
                        "extraParams": [],
                        "api": `endpoint_${index + 1}`,
                        "config": {}
                    },
                    "documentLink": "",
                    "actionStaticFields": [],
                    "disabled": "FALSE",
                    "isAllowDynamicField": "FALSE"
                };
                
                actions.push(action);
            }
        }
    }
    
    // Generate the response structure
    const response = {
        "endpoints": endpoints,
        "service": {
            "serviceType": "regular",
            "isDeprecated": "false",
            "versionTags": "[1]",
            "code": 100,
            "authenticationParam": {},
            "displayName": collectionName,
            "liveVersionTag": "1",
            "tokenRefreshDetails": {},
            "description": collectionDescription,
            "webhookVerifyApiLinkName": "",
            "version": "20250317.120000",
            "linkName": collectionName.toLowerCase().replace(/\s+/g, '_'),
            "categoryType": 0,
            "isDefaultUtility": "false",
            "categoryNames": [],
            "authenticationScheme": -1,
            "logo": "",
            "serviceId": "539890000001296113",
            "teamMail": "",
            "testApiLinkName": "",
            "infraType": 1
        },
        "envVariables": {},
        "data_type_validation": 0,
        "resources": resources,
        "triggers": triggers,
        "actions": actions
    };
    
    console.log('Generated endpoints:', endpoints.length);
    console.log('Generated resources:', resources.length);
    console.log('Generated triggers:', triggers.length);
    console.log('Generated actions:', actions.length);
    
    return response;
}



app.listen(process.env.PORT, () => {
    console.log(`Server is running on port ${process.env.PORT}`);
});
