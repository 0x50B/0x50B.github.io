---
categories: 
- X++
- C#
tags:
- X++
- C#
---
## Integrate Apache Kafka Client into Microsoft Dynamics 365 Finance and Operations, Supply Chain Management
"Apache Kafka is an open-source distributed event streaming platform used by thousands of companies for high-performance data pipelines, streaming analytics, data integration, and mission-critical applications." [Apache Kafka](https://kafka.apache.org/).
In this post, I show one way to integrate Kafka into D365 F&O/SCM.

## Confluent Kafka C# .NET client
Either create a C# project that builds a DLL you can reference, or reference the Kafka DLL from this [.NET client installation tutorial](https://docs.confluent.io/kafka-clients/dotnet/current/overview.html#dotnet-installation) directly.
I created a C# project that builds a library, and referenced that library from X++.

### Config (C#)
Adjust the code below to match the authentication your Kafka deployment uses. In my case that was SASL/PLAIN.
```csharp
namespace KafkaClient
{
    using Confluent.Kafka;

    public class Config
    {
        public string BootstrapServers { get; set; }

        private SecurityProtocol SecurityProtocol { get; set; } = SecurityProtocol.SaslSsl;

        private SaslMechanism SaslMechanism { get; set; } = SaslMechanism.Plain;

        public string SaslUsername { get; set; }

        public string SaslPassword { get; set; }

        public ClientConfig GetClientConfig()
        {
            return new ClientConfig()
            {
                BootstrapServers = BootstrapServers,
                SecurityProtocol = SecurityProtocol,
                SaslMechanism = SaslMechanism,
                SaslUsername = SaslUsername,
                SaslPassword = SaslPassword
            };
        }
    }
}
```

### Consumer (C#)
To consume messages from one or more Kafka topics, you need a consumer. This is how I built it. An X++ SysOperation service class configures the consumer and passes in the parameters, including how long it should listen before it releases its resources and the batch job starts again. If you need to, you can also reset a topic's offset to the beginning and read every message from the start. After a message is read it is committed, so the offset moves past that message and a restarted consumer does not fetch it again. `KafkaMessageProcessorInterface_BEC` is an X++ class called from C#. It handles the incoming message based on the topic name and the payload. For the other direction, calling X++ from C#, see [Write business logic by using C# and X++ source code](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/dev-tools/write-business-logic). 
```csharp
namespace KafkaClient
{
    using Confluent.Kafka;

    using Dynamics.AX.Application;

    using System;
    using System.Collections.Generic;
    using System.Linq;
    using System.Threading;

    public class Consumer
    {
        public Config Config { get; set; }

        public string GroupId { get; set; }
        public bool OffsetBeginning { get; set; }
        public int SecondsBeforeTimeout { get; set; }

        private readonly List<string> TopicSubscriptionList = new List<string>();
        

        public void SubscribeTopic(string topic)
        {
            TopicSubscriptionList.Add(topic);
        }

        public void Consume()
        {
            ConsumerConfig consumerConfig = new ConsumerConfig(Config.GetClientConfig())
            {
                GroupId = GroupId,
                EnableAutoCommit = false,
                AutoOffsetReset = AutoOffsetReset.Earliest
            };

            var consumerBuilder = new ConsumerBuilder<Ignore, string>(consumerConfig)
                .SetValueDeserializer(new CustomStringDeserializer());

            if (OffsetBeginning)
            { 
                consumerBuilder.SetPartitionsAssignedHandler((c, partitions) =>
                    {
                        var offsets = partitions.Select(tp => new TopicPartitionOffset(tp, Offset.Beginning));
                        return offsets;
                    }
                );
            }

            using (var consumer = consumerBuilder.Build())
            {
                consumer.Subscribe(TopicSubscriptionList); 

                CancellationTokenSource cts = new CancellationTokenSource();
                cts.CancelAfter(TimeSpan.FromSeconds(SecondsBeforeTimeout));

                try
                {
                    while (! cts.Token.IsCancellationRequested)
                    {
                        var message = consumer.Consume(cts.Token);

                        bool success = KafkaMessageProcessorInterface_BEC.process(message.Topic, message.Message.Value);

                        if (success)
                        { 
                            consumer.Commit(message);
                        }
                    }
                }
                catch (OperationCanceledException)
                { 
                    // this is expected: timeout error
                }
                finally
                {
                    consumer.Close();
                }
            }
        }
    }
}
```

### Consumer: CustomStringDeserializer (C#)
Every message produced to a Kafka topic starts with a magic byte before the actual payload, so you need a custom string deserializer that strips that byte first:
```csharp
namespace KafkaClient
{
    using System;
    using System.Text;
    using Confluent.Kafka;

    public class CustomStringDeserializer : IDeserializer<string>
    {
        private readonly int headerSize = sizeof(int) + sizeof(byte);
        private readonly byte magicByte = 0;

        public string Deserialize(ReadOnlySpan<byte> data, bool isNull, SerializationContext context)
        {
            if (isNull) return null;

            if (data.Length > 0 && data[0] == magicByte)
            {
                data = data.Slice(headerSize);
            }
            return Encoding.UTF8.GetString(data.ToArray());
        }
    }
}
```

### Consumer SysOperation service class
This class starts consumption from X++. I set the timeout to about five minutes and the recurrence to one minute. A batch job should not run forever and block the system.
```axapta
public final class KafkaMessageProcessorService_BEC extends SysOperationServiceBase
{
    KafkaParameters_BEC parameters = KafkaParameters_BEC::find();

    public void process(KafkaMessageProcessorContract_BEC _contract)
    {
        KafkaClient.Config config = new KafkaClient.Config();
        config.BootstrapServers = parameters.ConnectionBootstrapServers;
        config.SaslUsername = parameters.ConnectionSaslUsername;
        config.SaslPassword = parameters.decryptSaslPassword();

        KafkaClient.Consumer consumer = new KafkaClient.Consumer();
        consumer.Config = config;
        consumer.GroupId = parameters.ConsumerGroupId;
        consumer.OffsetBeginning = _contract.parmOffsetBeginning() == NoYes::Yes;
        consumer.SecondsBeforeTimeout = _contract.parmRunTimeInSeconds();

        container topicCon;

        KafkaMessageProcessorTypeInbound_BEC processorType;
        while select processorType
            where   processorType.Enabled &&
                    (!_contract.parmMessageType() || processorType.MessageTypeId == _contract.parmMessageType())
        {
            topicCon += processorType.TopicName;

            consumer.SubscribeTopic(processorType.TopicName);
        }

        if (conLen(topicCon) != 0)
        {
            consumer.Consume();
        }
    }
}
```

### Producer (C#)
The producer reuses the same config class, which you can pass in from X++. With it, you can produce messages to any Kafka topic.
```csharp
namespace KafkaClient
{
    using Confluent.Kafka;

    public class Producer
    {
        public Config Config { get; set; }

        public void ProduceMessage(string topic, string payload)
        {
            ProducerConfig producerConfig = new ProducerConfig(Config.GetClientConfig());

            using (var producer = new ProducerBuilder<string, string>(producerConfig)
                .SetValueSerializer(Serializers.Utf8)
                .Build()
            )
            {
                var message = new Message<string, string>()
                { 
                    Value = payload
                };

                producer.Produce(topic, message);
            }
        }
    }    
}
```

### Producer: business event to Kafka
To produce messages, I used the business events framework that ships with D365 F&O and wrote my own business event endpoint. How to create one is covered in the [business events developer documentation](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/business-events/business-events-dev-doc).
I will skip the enums, forms, and tables. The guide covers those. Here is the class:
```axapta
using KafkaClient;

[BusinessEventsEndpoint(BusinessEventsEndpointType::Kafka_BEC)]
public final class BusinessEventsKafkaAdapter_BEC extends BusinessEventsEndpointBase implements IBusinessEventsEndpoint
{
    Producer producer;
    str topic;

    public void initialize(BusinessEventsEndpoint _endpoint, boolean _forceCreate)
    {
        this.endpoint = _endpoint;  

        BusinessEventsKafkaEndpoint_BEC kafkaEndpoint = _endpoint as BusinessEventsKafkaEndpoint_BEC;

        topic = kafkaEndpoint.KafkaTopicName;
      
        Config config = new Config();
        config.BootstrapServers = kafkaEndpoint.BootstrapServers;
        config.SaslUsername = kafkaEndpoint.SaslUsername;
        config.SaslPassword = kafkaEndpoint.decryptSaslPassword();       

        producer = new Producer();
        producer.Config = Config;
    }

    protected void sendPayload(str _payload, BusinessEventsEndpointPayloadContext _context)
    {
        producer.ProduceMessage(topic, _payload);
    }

    public boolean isTransient(System.Exception _exception)
    {
        if (_exception is System.TimeoutException)
        {
            return true;
        }

        return false;
    }
}
```

Feel free to ask any questions.
