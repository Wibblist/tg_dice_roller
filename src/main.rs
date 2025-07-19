use rand::Rng;
use regex::Regex;

use teloxide::{
    prelude::*, sugar::request::RequestReplyExt, types::ParseMode, update_listeners::webhooks,
    utils::command::BotCommands,
};

#[tokio::main]
async fn main() {
    pretty_env_logger::init();
    log::info!("Starting dice roller bot...");

    let bot = Bot::from_env();

    let port = std::env::var("PORT").expect("PORT not set");
    let host = std::env::var("HOST").expect("HOST not set");
    let raw_url = std::env::var("WEBHOOK_URL").expect("WEBHOOK_URL not set");

    let addr = format!("{}:{}", host, port).parse().unwrap();
    let url = format!("{}/webhook", raw_url).parse().unwrap();

    let options = webhooks::Options::new(addr, url);

    let listener = webhooks::axum(bot.clone(), options)
        .await
        .expect("Failed to setup webhook");

    log::info!("Webhook setup successful, starting bot...");
    Command::repl_with_listener(bot, handle_commands, listener).await;
}

#[derive(BotCommands, Clone)]
#[command(
    rename_rule = "lowercase",
    description = "These commands are currently supported:"
)]
enum Command {
    #[command(description = "Start the bot.")]
    Start,
    #[command(description = "Display this text.")]
    Help,
    #[command(description = "Roll dice when given the right format (e.g. 2d20+5).")]
    R(String),
}

fn handle_dice_roll(roll_string: String, username: String) -> String {
    let pattern = Regex::new(r"^(\d*)d(\d+)(?:[+-](\d+))?$").unwrap();

    if let Some(caps) = pattern.captures(&roll_string) {
        let num_dice_str = caps.get(1).map_or("1", |m| m.as_str());
        let num_dice = match num_dice_str.parse::<i32>() {
            Ok(n) if n > 0 => n,
            _ if num_dice_str.is_empty() => 1,
            _ => {
                return format!(
                    "{} rolled an invalid number of dice. You can't roll negative dice.",
                    username
                )
            }
        };

        let faces_str = caps.get(2).map_or("0", |m| m.as_str());
        let faces = match faces_str.parse::<i32>() {
            Ok(n) if n > 0 => n,
            _ => {
                return format!(
                    "{} rolled an invalid number of sides on the dice. The dice gotta have at least 1 side.",
                    username
                )
            }
        };

        let modifier = if roll_string.contains('-') {
            caps.get(3)
                .map_or(0, |m| -m.as_str().parse::<i32>().unwrap_or(0))
        } else {
            caps.get(3)
                .map_or(0, |m| m.as_str().parse::<i32>().unwrap_or(0))
        };

        let mut rng = rand::rng();
        let rolls: Vec<i32> = (0..num_dice).map(|_| rng.random_range(1..=faces)).collect();

        let dice_total: i32 = rolls.iter().sum();
        let total = dice_total + modifier;

        let rolls_str = rolls
            .iter()
            .map(|&r| r.to_string())
            .collect::<Vec<String>>()
            .join(" + ");

        if modifier != 0 {
            format!(
                "{} rolled {}d{}{}{}: [{}] {} {} = {}",
                username,
                num_dice,
                faces,
                if modifier < 0 { "-" } else { "+" },
                modifier.abs(),
                rolls_str,
                if modifier < 0 { "-" } else { "+" },
                modifier.abs(),
                total
            )
        } else {
            format!(
                "{} rolled {}d{}: [{}] = {}",
                username, num_dice, faces, rolls_str, total
            )
        }
    } else {
        "Invalid dice roll format. Use format like '2d20+5' or '2d20-5'".to_string()
    }
}

async fn handle_commands(bot: Bot, msg: Message, cmd: Command) -> ResponseResult<()> {
    match cmd {
        Command::Start => {
            bot.send_message(
                msg.chat.id,
                "🎲 Ayyyy, I'm rollin here! >:D\nUse /help to see available commands.".to_string(),
            )
            .await?
        }
        Command::Help => {
            bot.send_message(msg.chat.id, Command::descriptions().to_string())
                .await?
        }
        Command::R(roll_string) => {
            let user = msg.from.unwrap();
            let username = user.mention().unwrap_or_else(|| user.first_name.clone());

            bot.send_message(msg.chat.id, handle_dice_roll(roll_string, username))
                .parse_mode(ParseMode::Html)
                .reply_to(msg.id)
                .await?
        }
    };

    Ok(())
}
